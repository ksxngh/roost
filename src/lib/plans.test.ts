import { describe, expect, it } from "vitest";

import {
  ANNUAL_MONTHS_CHARGED,
  COMPETITOR_FEE_BPS,
  MARKETPLACE_FEE_BPS,
  PLANS,
  PLAN_FEATURES,
  annualPriceCents,
  monthlySavingCents,
  planById,
} from "@/lib/plans";
import { serverEnv } from "@/lib/env";

describe("plan pricing", () => {
  it("offers exactly the two tiers the marketing compares", () => {
    expect(PLANS.map((plan) => plan.id)).toEqual(["pro", "premium"]);
  });

  it("prices every tier in whole cents", () => {
    for (const plan of PLANS) {
      expect(Number.isInteger(plan.priceCents)).toBe(true);
      expect(Number.isInteger(plan.competitorPriceCents)).toBe(true);
    }
  });

  it("undercuts the competitor on every tier", () => {
    for (const plan of PLANS) {
      expect(plan.priceCents).toBeLessThan(plan.competitorPriceCents);
    }
  });

  it("undercuts by between $10 and $20, the agreed positioning", () => {
    for (const plan of PLANS) {
      const saving = monthlySavingCents(plan);
      expect(saving).toBeGreaterThanOrEqual(1_000);
      expect(saving).toBeLessThanOrEqual(2_000);
    }
  });

  it("prices Premium above Pro", () => {
    expect(planById("premium").priceCents).toBeGreaterThan(
      planById("pro").priceCents,
    );
  });

  it("gives Premium more seats than Pro", () => {
    expect(planById("premium").seats).toBeGreaterThan(planById("pro").seats);
    expect(planById("pro").seats).toBe(1);
  });

  it("charges ten months for a year", () => {
    const pro = planById("pro");
    expect(annualPriceCents(pro)).toBe(pro.priceCents * ANNUAL_MONTHS_CHARGED);
    // Two months free, so a year must cost less than twelve months.
    expect(annualPriceCents(pro)).toBeLessThan(pro.priceCents * 12);
  });

  it("throws on an unknown plan rather than returning undefined", () => {
    // @ts-expect-error — deliberately outside the union.
    expect(() => planById("enterprise")).toThrow(/Unknown plan/);
  });
});

describe("marketplace fee", () => {
  it("undercuts the competitor's take rate too", () => {
    expect(MARKETPLACE_FEE_BPS).toBeLessThan(COMPETITOR_FEE_BPS);
  });

  /**
   * The bug this guards against is charging more than the pricing page says.
   * The page reads `MARKETPLACE_FEE_BPS`; checkout reads `PLATFORM_FEE_BPS`.
   * If those two ever drift, providers are billed a rate they never saw.
   */
  it("matches the rate checkout actually applies", () => {
    expect(serverEnv().PLATFORM_FEE_BPS).toBe(MARKETPLACE_FEE_BPS);
  });
});

describe("feature comparison", () => {
  it("lists every feature exactly once", () => {
    const labels = PLAN_FEATURES.map((feature) => feature.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("never gives Pro something Premium lacks", () => {
    for (const feature of PLAN_FEATURES) {
      if (feature.pro !== false) {
        expect(feature.premium).not.toBe(false);
      }
    }
  });

  it("has at least one headline row to justify the upgrade", () => {
    const headlines = PLAN_FEATURES.filter((feature) => feature.headline);
    expect(headlines.length).toBeGreaterThan(0);
    for (const feature of headlines) {
      expect(feature.pro).toBe(false);
    }
  });

  it("pairs any text override with an included status", () => {
    for (const feature of PLAN_FEATURES) {
      if (feature.proText) expect(feature.pro).not.toBe(false);
      if (feature.premiumText) expect(feature.premium).not.toBe(false);
    }
  });

  it("states the seat counts the plans actually define", () => {
    const seats = PLAN_FEATURES.find(
      (feature) => feature.label === "Team seats",
    );
    expect(seats?.proText).toContain(String(planById("pro").seats));
    expect(seats?.premiumText).toContain(String(planById("premium").seats));
  });

  /**
   * A pricing page that ticks something the product cannot do is a lie no
   * other test would catch. Anything not built must say "soon".
   */
  it("marks unbuilt capability as soon rather than ticking it", () => {
    const notYetBuilt = [
      "Guaranteed bookings — Roost advertises you and sends you jobs",
      "Roost-funded advertising across search and social",
      "Client list and job history",
      "Invite employees",
      "Granular permissions per teammate",
    ];
    for (const label of notYetBuilt) {
      const feature = PLAN_FEATURES.find((entry) => entry.label === label);
      expect(feature, `missing feature row: ${label}`).toBeDefined();
      for (const status of [feature!.pro, feature!.premium]) {
        expect(status === false || status === "soon").toBe(true);
      }
    }
  });

  it("marks shipped capability live", () => {
    const shipped = [
      "Public storefront on the Roost marketplace",
      "Bookings, scheduling, and job workflow",
      "Card payments, deposits, and automatic refunds",
      "Licence and insurance verification",
      "Calendar, day sheets, and job reminders",
      "Assign jobs across your team",
      "Quotes and invoicing",
    ];
    for (const label of shipped) {
      const feature = PLAN_FEATURES.find((entry) => entry.label === label);
      expect(feature, `missing feature row: ${label}`).toBeDefined();
      expect(feature!.premium).toBe("live");
    }
  });
});
