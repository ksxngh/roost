import { describe, expect, it } from "vitest";

import { PlanTier, SubscriptionStatus } from "@/generated/prisma/enums";
import {
  DEFAULT_PLAN,
  effectivePlan,
  toSubscriptionStatus,
} from "@/server/billing/subscription";

describe("toSubscriptionStatus", () => {
  it.each([
    ["active", SubscriptionStatus.ACTIVE],
    ["trialing", SubscriptionStatus.TRIALING],
    ["past_due", SubscriptionStatus.PAST_DUE],
    ["incomplete", SubscriptionStatus.INCOMPLETE],
  ])("maps %s", (stripe, expected) => {
    expect(toSubscriptionStatus(stripe)).toBe(expected);
  });

  it.each(["canceled", "unpaid", "incomplete_expired", "paused", "anything"])(
    "treats %s as canceled",
    (stripe) => {
      expect(toSubscriptionStatus(stripe)).toBe(SubscriptionStatus.CANCELED);
    },
  );
});

describe("effectivePlan", () => {
  it.each([
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.TRIALING,
    SubscriptionStatus.PAST_DUE,
  ])("grants the subscribed tier while %s", (status) => {
    expect(effectivePlan(status, PlanTier.PRO)).toBe(PlanTier.PRO);
    expect(effectivePlan(status, PlanTier.PREMIUM)).toBe(PlanTier.PREMIUM);
  });

  it.each([SubscriptionStatus.CANCELED, SubscriptionStatus.INCOMPLETE])(
    "reverts to the default when %s",
    (status) => {
      expect(effectivePlan(status, PlanTier.PRO)).toBe(DEFAULT_PLAN);
    },
  );

  it("keeps a lapsed subscriber on their tier only while past_due", () => {
    // past_due keeps access (Stripe is retrying); canceled does not.
    expect(effectivePlan(SubscriptionStatus.PAST_DUE, PlanTier.PRO)).toBe(
      PlanTier.PRO,
    );
    expect(effectivePlan(SubscriptionStatus.CANCELED, PlanTier.PRO)).toBe(
      DEFAULT_PLAN,
    );
  });
});
