import { serverEnv } from "@/lib/env";
import { siteConfig } from "@/lib/site-config";
import { NotFoundError, requireOwner } from "@/server/businesses/access";
import { prisma } from "@/server/db";
import { type StripeGateway, stripeGateway } from "@/server/payments/stripe";

export type ConnectStatus = {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

/**
 * Start or resume Stripe onboarding and return where to send the owner.
 *
 * Owner-only: connecting a Stripe account decides where a business's money
 * lands, which is not something an admin seat should be able to change.
 *
 * The account is created once and reused. Stripe account links expire in
 * minutes, so a fresh one is minted on every visit rather than stored.
 */
export async function startConnectOnboarding(
  userId: string,
  businessId: string,
  deps: { gateway?: StripeGateway; appUrl?: string } = {},
): Promise<{ url: string }> {
  await requireOwner(userId, businessId, "connect a payout account");

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, email: true, stripeAccountId: true },
  });
  if (!business) throw new NotFoundError();

  const gateway = deps.gateway ?? stripeGateway();
  const appUrl = deps.appUrl ?? siteConfig.url;

  let accountId = business.stripeAccountId;
  if (!accountId) {
    const account = await gateway.createConnectedAccount({
      email: business.email,
      businessName: business.name,
      // Canada-only for now; the marketplace does not list elsewhere yet.
      country: "CA",
    });
    accountId = account.id;
    await prisma.business.update({
      where: { id: businessId },
      data: { stripeAccountId: accountId },
    });
  }

  const link = await gateway.createAccountLink({
    accountId,
    refreshUrl: `${appUrl}/settings/payments?refresh=1`,
    returnUrl: `${appUrl}/settings/payments?connected=1`,
  });
  return { url: link.url };
}

/**
 * Re-read the connected account from Stripe and store the result.
 *
 * Stripe is authoritative about whether an account may take money; these
 * columns are a cache, refreshed when the owner returns from onboarding and
 * whenever `account.updated` arrives.
 */
export async function refreshConnectStatus(
  businessId: string,
  deps: { gateway?: StripeGateway } = {},
): Promise<ConnectStatus> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { stripeAccountId: true },
  });
  if (!business?.stripeAccountId) {
    return {
      connected: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    };
  }

  const account = await (deps.gateway ?? stripeGateway()).retrieveAccount(
    business.stripeAccountId,
  );
  await prisma.business.update({
    where: { id: businessId },
    data: {
      stripeChargesEnabled: account.chargesEnabled,
      stripePayoutsEnabled: account.payoutsEnabled,
      stripeDetailsSubmitted: account.detailsSubmitted,
    },
  });

  return { connected: true, ...account };
}

/** The cached status, for rendering. Never used to decide a charge. */
export async function getConnectStatus(
  userId: string,
  businessId: string,
): Promise<ConnectStatus> {
  const business = await prisma.business.findFirst({
    where: { id: businessId, members: { some: { userId } } },
    select: {
      stripeAccountId: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
    },
  });
  if (!business) throw new NotFoundError();

  return {
    connected: Boolean(business.stripeAccountId),
    chargesEnabled: business.stripeChargesEnabled,
    payoutsEnabled: business.stripePayoutsEnabled,
    detailsSubmitted: business.stripeDetailsSubmitted,
  };
}

/** Basis points this deployment charges. */
export function feeBasisPoints(env = serverEnv()): number {
  return env.PLATFORM_FEE_BPS;
}
