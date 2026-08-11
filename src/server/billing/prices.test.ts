import { describe, expect, it } from "vitest";

import { PlanTier } from "@/generated/prisma/enums";
import {
  priceIdFor,
  refForPriceId,
  subscriptionsConfigured,
} from "@/server/billing/prices";

/** A fully-configured env, price ids stubbed. */
const full = {
  STRIPE_PRICE_PRO_MONTHLY: "price_pro_m",
  STRIPE_PRICE_PRO_ANNUAL: "price_pro_a",
  STRIPE_PRICE_PREMIUM_MONTHLY: "price_prem_m",
  STRIPE_PRICE_PREMIUM_ANNUAL: "price_prem_a",
} as Parameters<typeof priceIdFor>[2];

describe("subscriptionsConfigured", () => {
  it("is true when both monthly prices are present", () => {
    expect(subscriptionsConfigured(full)).toBe(true);
  });

  it("is false without the premium monthly price", () => {
    expect(
      subscriptionsConfigured({
        ...full,
        STRIPE_PRICE_PREMIUM_MONTHLY: undefined,
      } as typeof full),
    ).toBe(false);
  });

  it("does not require the annual prices", () => {
    expect(
      subscriptionsConfigured({
        STRIPE_PRICE_PRO_MONTHLY: "price_pro_m",
        STRIPE_PRICE_PREMIUM_MONTHLY: "price_prem_m",
      } as typeof full),
    ).toBe(true);
  });
});

describe("price mapping", () => {
  it("resolves a tier and interval to its price id", () => {
    expect(priceIdFor(PlanTier.PRO, "monthly", full)).toBe("price_pro_m");
    expect(priceIdFor(PlanTier.PREMIUM, "annual", full)).toBe("price_prem_a");
  });

  it("round-trips a price id back to its tier and interval", () => {
    expect(refForPriceId("price_prem_m", full)).toEqual({
      tier: PlanTier.PREMIUM,
      interval: "monthly",
    });
    expect(refForPriceId("price_pro_a", full)).toEqual({
      tier: PlanTier.PRO,
      interval: "annual",
    });
  });

  it("returns null for an unconfigured price", () => {
    expect(
      priceIdFor(PlanTier.PRO, "annual", {
        STRIPE_PRICE_PRO_MONTHLY: "price_pro_m",
        STRIPE_PRICE_PREMIUM_MONTHLY: "price_prem_m",
      } as typeof full),
    ).toBeNull();
  });

  it("returns null for an unknown price id", () => {
    expect(refForPriceId("price_nope", full)).toBeNull();
  });

  it("agrees in both directions for every configured price", () => {
    for (const tier of [PlanTier.PRO, PlanTier.PREMIUM]) {
      for (const interval of ["monthly", "annual"] as const) {
        const priceId = priceIdFor(tier, interval, full)!;
        expect(refForPriceId(priceId, full)).toEqual({ tier, interval });
      }
    }
  });
});
