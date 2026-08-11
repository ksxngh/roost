import {
  PlanTier,
  SubscriptionStatus,
} from "@/generated/prisma/enums";
import { planTierToId, seatLimit } from "@/lib/plans";
import { siteConfig } from "@/lib/site-config";
import { NotFoundError, requireMembership, requireOwner } from "@/server/businesses/access";
import {
  type BillingInterval,
  priceIdFor,
  refForPriceId,
} from "@/server/billing/prices";
import { prisma } from "@/server/db";
import { type StripeGateway, stripeGateway } from "@/server/payments/stripe";

/**
 * The plan a business has when no subscription is paying for one.
 *
 * PREMIUM during the pre-billing phase: nobody is charged yet, so granting the
 * full tier by default is the correct launch posture (see the note on
 * `PlanTier` in the schema, and docs/subscriptions.md). Going live changes
 * this to a restricted default or requires checkout at onboarding.
 */
export const DEFAULT_PLAN = PlanTier.PREMIUM;

/** Statuses in which the customer is entitled to their subscribed tier. */
const PAYING_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.PAST_DUE,
];

/** Raised when a plan change would leave more members than seats. */
export class DowngradeBlockedError extends Error {
  constructor(tier: PlanTier, members: number) {
    super(
      `Your team has ${members} members, more than the ${seatLimit(tier)} seats on the ${planTierToId(tier)} plan. Remove members before downgrading.`,
    );
    this.name = "DowngradeBlockedError";
  }
}

export class BillingNotConfiguredError extends Error {
  constructor() {
    super("Subscription billing is not available on this deployment.");
    this.name = "BillingNotConfiguredError";
  }
}

/** Map a Stripe subscription status string to our enum. */
export function toSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
      return SubscriptionStatus.ACTIVE;
    case "trialing":
      return SubscriptionStatus.TRIALING;
    case "past_due":
      return SubscriptionStatus.PAST_DUE;
    case "incomplete":
      return SubscriptionStatus.INCOMPLETE;
    // canceled, unpaid, incomplete_expired, paused — all "not paying".
    default:
      return SubscriptionStatus.CANCELED;
  }
}

/** The effective plan for a subscription state — tier while paying, else default. */
export function effectivePlan(
  status: SubscriptionStatus,
  tier: PlanTier,
): PlanTier {
  return PAYING_STATUSES.includes(status) ? tier : DEFAULT_PLAN;
}

export type SubscriptionView = {
  plan: PlanTier;
  seatLimit: number;
  memberCount: number;
  overSeatLimit: boolean;
  subscription: {
    tier: PlanTier;
    status: SubscriptionStatus;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

/** The billing settings view. Any member may see it. */
export async function getSubscription(
  userId: string,
  businessId: string,
): Promise<SubscriptionView> {
  await requireMembership(userId, businessId);

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      plan: true,
      _count: { select: { members: true } },
      subscription: {
        select: {
          tier: true,
          status: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      },
    },
  });
  if (!business) throw new NotFoundError();

  const limit = seatLimit(business.plan);
  return {
    plan: business.plan,
    seatLimit: limit,
    memberCount: business._count.members,
    overSeatLimit: business._count.members > limit,
    subscription: business.subscription,
  };
}

/**
 * Start checkout for a plan.
 *
 * Owner-only: the subscription is the business's money. A downgrade that would
 * leave more members than the new plan's seats is blocked here — the one place
 * a plan change is initiated, since the Stripe billing portal is configured
 * for cancellation and payment method only, not plan switching.
 */
export async function startSubscriptionCheckout(
  userId: string,
  businessId: string,
  tier: PlanTier,
  interval: BillingInterval,
  deps: { gateway?: StripeGateway; appUrl?: string } = {},
): Promise<{ url: string }> {
  await requireOwner(userId, businessId, "change the subscription");

  const priceId = priceIdFor(tier, interval);
  if (!priceId) throw new BillingNotConfiguredError();

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      email: true,
      _count: { select: { members: true } },
      subscription: { select: { stripeCustomerId: true } },
    },
  });
  if (!business) throw new NotFoundError();

  if (business._count.members > seatLimit(tier)) {
    throw new DowngradeBlockedError(tier, business._count.members);
  }

  const gateway = deps.gateway ?? stripeGateway();
  const appUrl = deps.appUrl ?? siteConfig.url;

  const customer = await gateway.ensureCustomer({
    businessId,
    email: business.email,
    name: business.name,
    existingCustomerId: business.subscription?.stripeCustomerId ?? null,
  });

  // Persist the customer immediately, so a checkout that is abandoned still
  // reuses this customer next time rather than creating a second.
  await prisma.subscription.upsert({
    where: { businessId },
    create: {
      businessId,
      stripeCustomerId: customer.id,
      tier,
      status: SubscriptionStatus.INCOMPLETE,
    },
    update: { stripeCustomerId: customer.id },
  });

  const session = await gateway.createSubscriptionCheckout({
    customerId: customer.id,
    priceId,
    successUrl: `${appUrl}/settings/billing?subscribed=1`,
    cancelUrl: `${appUrl}/settings/billing`,
    metadata: { businessId, tier },
    idempotencyKey: `sub-checkout:${businessId}:${tier}:${interval}`,
  });
  return { url: session.url };
}

/** Open the Stripe billing portal for an existing customer. Owner-only. */
export async function openBillingPortal(
  userId: string,
  businessId: string,
  deps: { gateway?: StripeGateway; appUrl?: string } = {},
): Promise<{ url: string }> {
  await requireOwner(userId, businessId, "manage billing");

  const subscription = await prisma.subscription.findUnique({
    where: { businessId },
    select: { stripeCustomerId: true },
  });
  if (!subscription) throw new NotFoundError("subscription");

  const { url } = await (deps.gateway ?? stripeGateway()).createBillingPortalSession(
    {
      customerId: subscription.stripeCustomerId,
      returnUrl: `${(deps.appUrl ?? siteConfig.url)}/settings/billing`,
    },
  );
  return { url };
}

/**
 * Apply a Stripe subscription object to our state.
 *
 * Called only from the verified webhook. The subscription carries the
 * businessId and tier in its metadata (set at checkout); the price is the
 * fallback source of the tier if metadata is ever absent. Writes the
 * subscription cache and the business's effective plan together.
 */
export async function applyStripeSubscription(subscription: {
  id: string;
  customerId: string;
  status: string;
  priceId: string | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  metadata: Record<string, string>;
}): Promise<{ applied: boolean }> {
  const businessId = subscription.metadata.businessId;
  if (!businessId) return { applied: false };

  const tier =
    (subscription.metadata.tier as PlanTier | undefined) ??
    (subscription.priceId
      ? refForPriceId(subscription.priceId)?.tier
      : undefined);
  if (!tier) return { applied: false };

  const status = toSubscriptionStatus(subscription.status);
  const periodEnd = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd * 1000)
    : null;

  // The business must exist and own this customer, or a spoofed metadata
  // businessId could hijack another business's plan.
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { subscription: { select: { stripeCustomerId: true } } },
  });
  if (!business) return { applied: false };
  if (
    business.subscription &&
    business.subscription.stripeCustomerId !== subscription.customerId
  ) {
    return { applied: false };
  }

  await prisma.$transaction([
    prisma.subscription.upsert({
      where: { businessId },
      create: {
        businessId,
        stripeCustomerId: subscription.customerId,
        stripeSubscriptionId: subscription.id,
        tier,
        status,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      update: {
        stripeSubscriptionId: subscription.id,
        tier,
        status,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
    }),
    prisma.business.update({
      where: { id: businessId },
      data: { plan: effectivePlan(status, tier) },
    }),
  ]);

  return { applied: true };
}

/** Mark a subscription cancelled and revert the plan to the default. */
export async function cancelStripeSubscription(
  stripeSubscriptionId: string,
): Promise<{ applied: boolean }> {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
    select: { businessId: true },
  });
  if (!subscription) return { applied: false };

  await prisma.$transaction([
    prisma.subscription.update({
      where: { stripeSubscriptionId },
      data: {
        status: SubscriptionStatus.CANCELED,
        cancelAtPeriodEnd: false,
      },
    }),
    prisma.business.update({
      where: { id: subscription.businessId },
      data: { plan: DEFAULT_PLAN },
    }),
  ]);
  return { applied: true };
}
