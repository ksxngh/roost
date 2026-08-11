"use server";

import { PlanTier } from "@/generated/prisma/enums";
import {
  ForbiddenError,
  NotFoundError,
  currentMembership,
} from "@/server/businesses/access";
import {
  BillingNotConfiguredError,
  DowngradeBlockedError,
  openBillingPortal,
  startSubscriptionCheckout,
} from "@/server/billing/subscription";
import type { BillingInterval } from "@/server/billing/prices";
import { StripeNotConfiguredError } from "@/server/payments/stripe";
import { getSession } from "@/server/session";

type Result = { ok: false; error: string } | { ok: true; url: string };

function invalid(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

const TIERS = new Set<string>([PlanTier.PRO, PlanTier.PREMIUM]);
const INTERVALS = new Set<string>(["monthly", "annual"]);

type Context =
  | { error: { ok: false; error: string } }
  | { userId: string; businessId: string };

async function owner(): Promise<Context> {
  const session = await getSession();
  if (!session) return { error: invalid("Sign in to manage billing.") };
  const membership = await currentMembership(session.user.id);
  if (!membership) return { error: invalid("Set up your business first.") };
  return { userId: session.user.id, businessId: membership.businessId };
}

function translate(error: unknown): { ok: false; error: string } | null {
  if (error instanceof DowngradeBlockedError) return invalid(error.message);
  if (
    error instanceof BillingNotConfiguredError ||
    error instanceof StripeNotConfiguredError
  ) {
    return invalid("Subscription billing isn't available yet.");
  }
  if (error instanceof ForbiddenError || error instanceof NotFoundError) {
    return invalid(error.message);
  }
  return null;
}

export async function startCheckoutAction(
  tier: string,
  interval: string,
): Promise<Result> {
  if (!TIERS.has(tier) || !INTERVALS.has(interval)) {
    return invalid("Choose a valid plan.");
  }
  const context = await owner();
  if ("error" in context) return context.error;

  try {
    const { url } = await startSubscriptionCheckout(
      context.userId,
      context.businessId,
      tier as PlanTier,
      interval as BillingInterval,
    );
    return { ok: true, url };
  } catch (error) {
    const known = translate(error);
    if (known) return known;
    console.error("[billing] checkout failed:", error);
    return invalid("Could not reach Stripe. Please try again.");
  }
}

export async function openPortalAction(): Promise<Result> {
  const context = await owner();
  if ("error" in context) return context.error;

  try {
    const { url } = await openBillingPortal(context.userId, context.businessId);
    return { ok: true, url };
  } catch (error) {
    const known = translate(error);
    if (known) return known;
    console.error("[billing] portal failed:", error);
    return invalid("Could not open the billing portal. Please try again.");
  }
}
