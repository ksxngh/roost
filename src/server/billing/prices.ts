import { PlanTier } from "@/generated/prisma/enums";
import { serverEnv } from "@/lib/env";

export type BillingInterval = "monthly" | "annual";

export type PriceRef = { tier: PlanTier; interval: BillingInterval };

/**
 * The mapping between Roost's plan tiers and Stripe price ids.
 *
 * Held in one place so a webhook that arrives with a price id can find its
 * tier, and a checkout that starts from a tier can find its price. Both
 * directions must agree, or a customer could be charged for one tier and
 * granted another.
 */
function priceTable(env = serverEnv()): { ref: PriceRef; priceId: string }[] {
  const entries: { ref: PriceRef; priceId: string | undefined }[] = [
    {
      ref: { tier: PlanTier.PRO, interval: "monthly" },
      priceId: env.STRIPE_PRICE_PRO_MONTHLY,
    },
    {
      ref: { tier: PlanTier.PRO, interval: "annual" },
      priceId: env.STRIPE_PRICE_PRO_ANNUAL,
    },
    {
      ref: { tier: PlanTier.PREMIUM, interval: "monthly" },
      priceId: env.STRIPE_PRICE_PREMIUM_MONTHLY,
    },
    {
      ref: { tier: PlanTier.PREMIUM, interval: "annual" },
      priceId: env.STRIPE_PRICE_PREMIUM_ANNUAL,
    },
  ];
  return entries.filter(
    (entry): entry is { ref: PriceRef; priceId: string } =>
      entry.priceId !== undefined,
  );
}

/**
 * Whether subscription billing is configured.
 *
 * Requires both tiers' *monthly* prices — the minimum to sell either plan.
 * Annual is a bonus. The Stripe keys themselves are checked separately
 * (`paymentsConfigured`).
 */
export function subscriptionsConfigured(env = serverEnv()): boolean {
  return Boolean(
    env.STRIPE_PRICE_PRO_MONTHLY && env.STRIPE_PRICE_PREMIUM_MONTHLY,
  );
}

/** The Stripe price id for a tier and interval, or null if not configured. */
export function priceIdFor(
  tier: PlanTier,
  interval: BillingInterval,
  env = serverEnv(),
): string | null {
  const match = priceTable(env).find(
    (entry) => entry.ref.tier === tier && entry.ref.interval === interval,
  );
  return match?.priceId ?? null;
}

/** The tier and interval behind a Stripe price id, or null if unknown. */
export function refForPriceId(
  priceId: string,
  env = serverEnv(),
): PriceRef | null {
  return priceTable(env).find((entry) => entry.priceId === priceId)?.ref ?? null;
}
