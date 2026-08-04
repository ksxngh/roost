import { describe, expect, it } from "vitest";

import {
  MIN_CHARGE_CENTS,
  chargeability,
  isChargeable,
  platformFeeCents,
  providerNetCents,
} from "@/lib/validations/payment";

describe("platformFeeCents", () => {
  it("takes the stated percentage of a round amount", () => {
    expect(platformFeeCents(10_000, 1000)).toBe(1000);
  });

  it("rounds down, never up, so the provider is not shortchanged", () => {
    // 10% of $149.99 is 1499.9 cents.
    expect(platformFeeCents(14_999, 1000)).toBe(1499);
  });

  it.each([
    [1, 1000, 0],
    [9, 1000, 0],
    [10, 1000, 1],
    [99, 1000, 9],
  ])("takes %i cents at %i bps as %i", (amount, bps, expected) => {
    expect(platformFeeCents(amount, bps)).toBe(expected);
  });

  it("is zero when the fee is switched off", () => {
    expect(platformFeeCents(10_000, 0)).toBe(0);
  });

  it("is zero for a zero or negative amount", () => {
    expect(platformFeeCents(0, 1000)).toBe(0);
    expect(platformFeeCents(-500, 1000)).toBe(0);
  });

  it("never takes the whole charge, which Stripe would reject", () => {
    expect(platformFeeCents(100, 10_000)).toBe(99);
    expect(platformFeeCents(1, 10_000)).toBe(0);
  });

  it("always leaves the provider something", () => {
    for (const amount of [1, 50, 99, 100, 12_345, 999_999]) {
      for (const bps of [0, 1, 250, 1000, 3000]) {
        const fee = platformFeeCents(amount, bps);
        expect(fee).toBeGreaterThanOrEqual(0);
        expect(fee).toBeLessThan(amount);
      }
    }
  });

  it("returns whole cents only", () => {
    for (const amount of [3, 7, 33, 12_345]) {
      expect(Number.isInteger(platformFeeCents(amount, 1000))).toBe(true);
    }
  });
});

describe("providerNetCents", () => {
  it("is the charge minus the fee", () => {
    expect(providerNetCents(10_000, 1000)).toBe(9000);
  });

  it("always sums back to the original amount", () => {
    for (const amount of [50, 149_99, 100_000]) {
      expect(
        providerNetCents(amount, 1000) + platformFeeCents(amount, 1000),
      ).toBe(amount);
    }
  });
});

describe("chargeability", () => {
  const fixed = {
    pricingModel: "FIXED" as const,
    priceCents: 12_000,
    chargesEnabled: true,
  };

  it("accepts a fixed price on a connected account", () => {
    expect(chargeability(fixed)).toBe("ok");
    expect(isChargeable(fixed)).toBe(true);
  });

  it("refuses when Stripe is not connected", () => {
    expect(chargeability({ ...fixed, chargesEnabled: false })).toBe(
      "not-connected",
    );
  });

  it("refuses quote-priced work, which has no number yet", () => {
    expect(
      chargeability({ ...fixed, pricingModel: "QUOTE", priceCents: null }),
    ).toBe("no-price");
  });

  it("refuses hourly work, which is billed on actual time", () => {
    expect(chargeability({ ...fixed, pricingModel: "HOURLY" })).toBe(
      "no-price",
    );
  });

  it("refuses a fixed price with no number", () => {
    expect(chargeability({ ...fixed, priceCents: null })).toBe("no-price");
  });

  it("refuses an amount below Stripe's minimum", () => {
    expect(chargeability({ ...fixed, priceCents: MIN_CHARGE_CENTS - 1 })).toBe(
      "below-minimum",
    );
    expect(chargeability({ ...fixed, priceCents: MIN_CHARGE_CENTS })).toBe(
      "ok",
    );
  });

  it("reports the connection problem first, as the one to fix", () => {
    expect(
      chargeability({
        pricingModel: "QUOTE",
        priceCents: null,
        chargesEnabled: false,
      }),
    ).toBe("not-connected");
  });
});
