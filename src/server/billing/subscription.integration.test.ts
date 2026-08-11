// @vitest-environment node
/**
 * Subscription billing.
 *
 * Stripe is the source of truth for status; these tests check what the app
 * does with its answers: only the owner changes the plan, a downgrade that
 * would strand members is refused, the plan follows the subscription's paying
 * state, and a spoofed weblook metadata businessId cannot hijack another
 * business's plan.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  BusinessRole,
  PlanTier,
  SubscriptionStatus,
} from "@/generated/prisma/enums";
import { ForbiddenError, NotFoundError } from "@/server/businesses/access";
import {
  DEFAULT_PLAN,
  DowngradeBlockedError,
  applyStripeSubscription,
  cancelStripeSubscription,
  getSubscription,
  openBillingPortal,
  startSubscriptionCheckout,
} from "@/server/billing/subscription";
import type { StripeGateway } from "@/server/payments/stripe";
import { prisma } from "@/server/db";

let seq = 0;

function fakeStripe() {
  const calls = {
    customers: [] as unknown[],
    checkouts: [] as Parameters<
      StripeGateway["createSubscriptionCheckout"]
    >[0][],
    portals: [] as unknown[],
  };
  const gateway: Pick<
    StripeGateway,
    "ensureCustomer" | "createSubscriptionCheckout" | "createBillingPortalSession"
  > = {
    async ensureCustomer(input) {
      calls.customers.push(input);
      seq += 1;
      return { id: input.existingCustomerId ?? `cus_${seq}` };
    },
    async createSubscriptionCheckout(input) {
      calls.checkouts.push(input);
      seq += 1;
      return { id: `cs_${seq}`, url: `https://checkout.test/${seq}` };
    },
    async createBillingPortalSession(input) {
      calls.portals.push(input);
      return { url: "https://portal.test" };
    },
  };
  return { gateway: gateway as StripeGateway, calls };
}

async function makeUser() {
  seq += 1;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      name: `User ${seq}`,
      email: `sub-${Date.now()}-${seq}@example.com`,
      emailVerified: true,
    },
  });
}

async function makeBusiness(plan: PlanTier = PlanTier.PREMIUM) {
  seq += 1;
  const owner = await makeUser();
  const business = await prisma.business.create({
    data: {
      slug: `sub-biz-${Date.now()}-${seq}`,
      name: "Northside Plumbing",
      email: "owner@northside.example",
      timezone: "America/Vancouver",
      plan,
      members: { create: { userId: owner.id, role: BusinessRole.OWNER } },
    },
  });
  return { ownerId: owner.id, businessId: business.id };
}

async function addMember(
  businessId: string,
  role: BusinessRole = BusinessRole.MEMBER,
) {
  const user = await makeUser();
  await prisma.businessMember.create({
    data: { businessId, userId: user.id, role },
  });
  return user.id;
}

beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("roost_test");
});

beforeEach(async () => {
  await prisma.subscription.deleteMany();
  await prisma.businessMember.deleteMany();
  await prisma.business.deleteMany();
  await prisma.user.deleteMany();
});

describe("startSubscriptionCheckout", () => {
  it("creates a customer, stores it, and returns a checkout url", async () => {
    const { ownerId, businessId } = await makeBusiness();
    const { gateway, calls } = fakeStripe();

    const { url } = await startSubscriptionCheckout(
      ownerId,
      businessId,
      PlanTier.PREMIUM,
      "monthly",
      { gateway },
    );

    expect(url).toMatch(/checkout\.test/);
    expect(calls.checkouts[0]).toMatchObject({
      priceId: "price_prem_m",
      metadata: { businessId, tier: PlanTier.PREMIUM },
    });
    const stored = await prisma.subscription.findUniqueOrThrow({
      where: { businessId },
    });
    expect(stored.stripeCustomerId).toMatch(/^cus_/);
    // Not yet active — the webhook flips that.
    expect(stored.status).toBe(SubscriptionStatus.INCOMPLETE);
  });

  it("reuses the existing customer on a second checkout", async () => {
    const { ownerId, businessId } = await makeBusiness();
    const { gateway } = fakeStripe();

    await startSubscriptionCheckout(ownerId, businessId, PlanTier.PRO, "monthly", {
      gateway,
    });
    const first = await prisma.subscription.findUniqueOrThrow({
      where: { businessId },
    });

    await startSubscriptionCheckout(
      ownerId,
      businessId,
      PlanTier.PREMIUM,
      "monthly",
      { gateway },
    );
    const second = await prisma.subscription.findUniqueOrThrow({
      where: { businessId },
    });

    expect(second.stripeCustomerId).toBe(first.stripeCustomerId);
    expect(await prisma.subscription.count({ where: { businessId } })).toBe(1);
  });

  it("blocks a downgrade that would strand members", async () => {
    const { ownerId, businessId } = await makeBusiness(PlanTier.PREMIUM);
    await addMember(businessId);
    await addMember(businessId); // 3 members total

    const { gateway, calls } = fakeStripe();
    await expect(
      startSubscriptionCheckout(ownerId, businessId, PlanTier.PRO, "monthly", {
        gateway,
      }),
    ).rejects.toBeInstanceOf(DowngradeBlockedError);
    expect(calls.checkouts).toHaveLength(0);
  });

  it("allows Pro when the team fits in one seat", async () => {
    const { ownerId, businessId } = await makeBusiness();
    const { gateway } = fakeStripe();

    await expect(
      startSubscriptionCheckout(ownerId, businessId, PlanTier.PRO, "monthly", {
        gateway,
      }),
    ).resolves.toMatchObject({ url: expect.any(String) });
  });

  it("refuses a non-owner", async () => {
    const { businessId } = await makeBusiness();
    const admin = await addMember(businessId, BusinessRole.ADMIN);
    const { gateway } = fakeStripe();

    await expect(
      startSubscriptionCheckout(admin, businessId, PlanTier.PRO, "monthly", {
        gateway,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("openBillingPortal", () => {
  it("opens the portal for an existing customer", async () => {
    const { ownerId, businessId } = await makeBusiness();
    const { gateway } = fakeStripe();
    await startSubscriptionCheckout(ownerId, businessId, PlanTier.PRO, "monthly", {
      gateway,
    });

    const { url } = await openBillingPortal(ownerId, businessId, { gateway });
    expect(url).toBe("https://portal.test");
  });

  it("errors when there is no subscription to manage", async () => {
    const { ownerId, businessId } = await makeBusiness();
    const { gateway } = fakeStripe();

    await expect(
      openBillingPortal(ownerId, businessId, { gateway }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a non-owner", async () => {
    const { ownerId, businessId } = await makeBusiness();
    const admin = await addMember(businessId, BusinessRole.ADMIN);
    const { gateway } = fakeStripe();
    // Premium fits the two members; a Pro checkout would trip the seat guard.
    await startSubscriptionCheckout(
      ownerId,
      businessId,
      PlanTier.PREMIUM,
      "monthly",
      { gateway },
    );

    await expect(
      openBillingPortal(admin, businessId, { gateway }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("applyStripeSubscription", () => {
  async function withCustomer(tier = PlanTier.PRO) {
    const { ownerId, businessId } = await makeBusiness();
    const { gateway } = fakeStripe();
    await startSubscriptionCheckout(ownerId, businessId, tier, "monthly", {
      gateway,
    });
    const { stripeCustomerId } = await prisma.subscription.findUniqueOrThrow({
      where: { businessId },
    });
    return { businessId, customerId: stripeCustomerId };
  }

  function event(
    businessId: string,
    customerId: string,
    overrides: Partial<Parameters<typeof applyStripeSubscription>[0]> = {},
  ): Parameters<typeof applyStripeSubscription>[0] {
    return {
      id: `sub_${randomUUID()}`,
      customerId,
      status: "active",
      priceId: "price_pro_m",
      currentPeriodEnd: 1_900_000_000,
      cancelAtPeriodEnd: false,
      metadata: { businessId, tier: PlanTier.PRO },
      ...overrides,
    };
  }

  it("activates the subscription and sets the business plan", async () => {
    const { businessId, customerId } = await withCustomer();

    const { applied } = await applyStripeSubscription(
      event(businessId, customerId),
    );

    expect(applied).toBe(true);
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    expect(business.plan).toBe(PlanTier.PRO);
    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { businessId },
    });
    expect(sub.status).toBe(SubscriptionStatus.ACTIVE);
    expect(sub.currentPeriodEnd).not.toBeNull();
  });

  it("falls back to the price when metadata omits the tier", async () => {
    const { businessId, customerId } = await withCustomer();

    await applyStripeSubscription(
      event(businessId, customerId, {
        metadata: { businessId },
        priceId: "price_prem_m",
      }),
    );

    expect(
      (await prisma.business.findUniqueOrThrow({ where: { id: businessId } }))
        .plan,
    ).toBe(PlanTier.PREMIUM);
  });

  it("reverts the plan to the default when the subscription is not paying", async () => {
    const { businessId, customerId } = await withCustomer();
    await applyStripeSubscription(event(businessId, customerId));

    await applyStripeSubscription(
      event(businessId, customerId, { status: "canceled" }),
    );

    expect(
      (await prisma.business.findUniqueOrThrow({ where: { id: businessId } }))
        .plan,
    ).toBe(DEFAULT_PLAN);
  });

  it("ignores an event whose customer does not match the business", async () => {
    const { businessId } = await withCustomer();

    const { applied } = await applyStripeSubscription(
      event(businessId, "cus_someone_else"),
    );

    expect(applied).toBe(false);
    // Plan unchanged from its pre-billing default.
    expect(
      (await prisma.business.findUniqueOrThrow({ where: { id: businessId } }))
        .plan,
    ).toBe(PlanTier.PREMIUM);
  });

  it("ignores an event with no businessId", async () => {
    const { customerId } = await withCustomer();
    const { applied } = await applyStripeSubscription({
      id: "sub_x",
      customerId,
      status: "active",
      priceId: "price_pro_m",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      metadata: {},
    });
    expect(applied).toBe(false);
  });

  it("ignores an event whose price and metadata name no known tier", async () => {
    const { businessId, customerId } = await withCustomer();
    const { applied } = await applyStripeSubscription(
      event(businessId, customerId, {
        metadata: { businessId },
        priceId: "price_unknown",
      }),
    );
    expect(applied).toBe(false);
  });
});

describe("cancelStripeSubscription", () => {
  it("cancels and reverts the plan", async () => {
    const { ownerId, businessId } = await makeBusiness();
    const { gateway } = fakeStripe();
    await startSubscriptionCheckout(ownerId, businessId, PlanTier.PRO, "monthly", {
      gateway,
    });
    const { stripeCustomerId } = await prisma.subscription.findUniqueOrThrow({
      where: { businessId },
    });
    const subId = `sub_${randomUUID()}`;
    await applyStripeSubscription({
      id: subId,
      customerId: stripeCustomerId,
      status: "active",
      priceId: "price_pro_m",
      currentPeriodEnd: 1_900_000_000,
      cancelAtPeriodEnd: false,
      metadata: { businessId, tier: PlanTier.PRO },
    });

    const { applied } = await cancelStripeSubscription(subId);

    expect(applied).toBe(true);
    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { businessId },
    });
    expect(sub.status).toBe(SubscriptionStatus.CANCELED);
    expect(
      (await prisma.business.findUniqueOrThrow({ where: { id: businessId } }))
        .plan,
    ).toBe(DEFAULT_PLAN);
  });

  it("ignores an unknown subscription id", async () => {
    expect((await cancelStripeSubscription("sub_nope")).applied).toBe(false);
  });
});

describe("getSubscription", () => {
  it("reports the plan, seats, and over-limit state", async () => {
    const { ownerId, businessId } = await makeBusiness(PlanTier.PRO);
    await addMember(businessId); // 2 members on a 1-seat plan

    const view = await getSubscription(ownerId, businessId);

    expect(view.plan).toBe(PlanTier.PRO);
    expect(view.seatLimit).toBe(1);
    expect(view.memberCount).toBe(2);
    expect(view.overSeatLimit).toBe(true);
  });

  it("is readable by any member", async () => {
    const { businessId } = await makeBusiness();
    const member = await addMember(businessId);

    await expect(getSubscription(member, businessId)).resolves.toMatchObject({
      plan: PlanTier.PREMIUM,
    });
  });
});
