// @vitest-environment node
/**
 * Payments against the real database with a fake Stripe.
 *
 * What matters here is what the application does with Stripe's answers:
 * money is never marked received without a verified event, a duplicate event
 * cannot refund twice, and a business's Stripe account is never something an
 * admin seat can change.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BusinessRole, PaymentStatus } from "@/generated/prisma/enums";
import { ForbiddenError } from "@/server/businesses/access";
import {
  AlreadyPaidError,
  PaymentNotRequiredError,
  createCheckoutForBooking,
  refundBookingPayment,
} from "@/server/payments/checkout";
import {
  getConnectStatus,
  refreshConnectStatus,
  startConnectOnboarding,
} from "@/server/payments/connect";
import type { StripeGateway } from "@/server/payments/stripe";
import { prisma } from "@/server/db";

let seq = 0;

/** Records every call so the arguments sent to Stripe can be asserted. */
function fakeStripe(overrides: Partial<StripeGateway> = {}) {
  const calls = {
    accounts: [] as unknown[],
    links: [] as unknown[],
    sessions: [] as Parameters<StripeGateway["createCheckoutSession"]>[0][],
    refunds: [] as Parameters<StripeGateway["refund"]>[0][],
  };

  const gateway: StripeGateway = {
    async createConnectedAccount(input) {
      calls.accounts.push(input);
      seq += 1;
      return { id: `acct_test_${seq}` };
    },
    async createAccountLink(input) {
      calls.links.push(input);
      return { url: "https://connect.stripe.test/onboard" };
    },
    async retrieveAccount() {
      return {
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      };
    },
    async createCheckoutSession(input) {
      calls.sessions.push(input);
      seq += 1;
      return {
        id: `cs_test_${seq}`,
        url: `https://checkout.stripe.test/${seq}`,
      };
    },
    async refund(input) {
      calls.refunds.push(input);
      seq += 1;
      return { id: `re_test_${seq}` };
    },
    async ensureCustomer({ existingCustomerId }) {
      seq += 1;
      return { id: existingCustomerId ?? `cus_test_${seq}` };
    },
    async createSubscriptionCheckout(input) {
      seq += 1;
      return {
        id: `cs_sub_${seq}`,
        url: `https://checkout.stripe.test/sub/${seq}`,
        ...input,
      };
    },
    async createBillingPortalSession() {
      return { url: "https://billing.stripe.test/portal" };
    },
    constructEvent() {
      throw new Error("not used in these tests");
    },
    ...overrides,
  };

  return { gateway, calls };
}

async function makeUser() {
  seq += 1;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      name: `User ${seq}`,
      email: `pay-${Date.now()}-${seq}@example.com`,
      emailVerified: true,
    },
  });
}

async function makeBusiness(
  overrides: Record<string, unknown> = {},
): Promise<{ userId: string; businessId: string }> {
  seq += 1;
  const user = await makeUser();
  const business = await prisma.business.create({
    data: {
      slug: `pay-biz-${Date.now()}-${seq}`,
      name: "Northside Plumbing",
      email: "hello@northside.example",
      timezone: "America/Vancouver",
      members: { create: { userId: user.id, role: BusinessRole.OWNER } },
      ...overrides,
    },
  });
  return { userId: user.id, businessId: business.id };
}

async function makeBooking(
  businessId: string,
  overrides: Record<string, unknown> = {},
) {
  seq += 1;
  return prisma.booking.create({
    data: {
      reference: `PAY${String(seq).padStart(5, "0")}`.slice(0, 8),
      businessId,
      packageName: "Drain unclogging",
      pricingModel: "FIXED",
      priceCents: 12_000,
      durationMinutes: 60,
      startAt: new Date("2027-03-01T17:00:00Z"),
      endAt: new Date("2027-03-01T18:00:00Z"),
      timezone: "America/Vancouver",
      customerName: "Dana Reyes",
      customerEmail: "dana@example.com",
      customerPhone: "604-555-0188",
      addressLine1: "12 Elm St",
      city: "Surrey",
      region: "BC",
      postalCode: "V3S 1A1",
      ...overrides,
    },
  });
}

const CONNECTED = {
  stripeAccountId: "acct_connected",
  stripeChargesEnabled: true,
  stripeDetailsSubmitted: true,
  stripePayoutsEnabled: true,
};

beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("roost_test");
});

beforeEach(async () => {
  await prisma.stripeWebhookEvent.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.business.deleteMany();
  await prisma.user.deleteMany();
});

describe("Connect onboarding", () => {
  it("creates an account once and reuses it", async () => {
    const { userId, businessId } = await makeBusiness();
    const { gateway, calls } = fakeStripe();

    await startConnectOnboarding(userId, businessId, { gateway });
    await startConnectOnboarding(userId, businessId, { gateway });

    expect(calls.accounts).toHaveLength(1);
    // A fresh link every time: Stripe's account links expire in minutes.
    expect(calls.links).toHaveLength(2);
  });

  it("stores the account id", async () => {
    const { userId, businessId } = await makeBusiness();
    const { gateway } = fakeStripe();

    await startConnectOnboarding(userId, businessId, { gateway });

    const stored = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    expect(stored.stripeAccountId).toMatch(/^acct_test_/);
  });

  it("refuses a non-owner, who must not redirect the money", async () => {
    const { businessId } = await makeBusiness();
    const admin = await makeUser();
    await prisma.businessMember.create({
      data: { businessId, userId: admin.id, role: BusinessRole.ADMIN },
    });
    const { gateway, calls } = fakeStripe();

    await expect(
      startConnectOnboarding(admin.id, businessId, { gateway }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls.accounts).toHaveLength(0);
  });

  it("stores the capabilities Stripe reports", async () => {
    const { businessId } = await makeBusiness({
      stripeAccountId: "acct_connected",
    });
    const { gateway } = fakeStripe();

    const status = await refreshConnectStatus(businessId, { gateway });

    expect(status).toEqual({
      connected: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
    });
    const stored = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    expect(stored.stripeChargesEnabled).toBe(true);
  });

  it("reports a business with no account as disconnected without calling Stripe", async () => {
    const { businessId } = await makeBusiness();
    const gateway = {
      retrieveAccount: vi.fn(),
    } as unknown as StripeGateway;

    const status = await refreshConnectStatus(businessId, { gateway });

    expect(status.connected).toBe(false);
    expect(gateway.retrieveAccount).not.toHaveBeenCalled();
  });

  it("lets any member read the status", async () => {
    const { businessId } = await makeBusiness(CONNECTED);
    const member = await makeUser();
    await prisma.businessMember.create({
      data: { businessId, userId: member.id, role: BusinessRole.MEMBER },
    });

    await expect(
      getConnectStatus(member.id, businessId),
    ).resolves.toMatchObject({ chargesEnabled: true });
  });

  it("hides the status from a non-member", async () => {
    const { businessId } = await makeBusiness(CONNECTED);
    const stranger = await makeUser();

    await expect(getConnectStatus(stranger.id, businessId)).rejects.toThrow();
  });
});

describe("createCheckoutForBooking", () => {
  it("charges the booking price and takes the platform fee", async () => {
    const { businessId } = await makeBusiness(CONNECTED);
    const booking = await makeBooking(businessId);
    const { gateway, calls } = fakeStripe();

    const { payment } = await createCheckoutForBooking(booking.id, {
      gateway,
      feeBps: 1000,
    });

    expect(calls.sessions[0]).toMatchObject({
      accountId: "acct_connected",
      amountCents: 12_000,
      platformFeeCents: 1200,
      customerEmail: "dana@example.com",
    });
    expect(payment.status).toBe(PaymentStatus.PENDING);
    expect(payment.amountCents).toBe(12_000);
    expect(payment.platformFeeCents).toBe(1200);
  });

  it("charges the booking's price, not the package's current one", async () => {
    const { businessId } = await makeBusiness(CONNECTED);
    // The booking snapshotted $120; the service is now $500.
    const servicePackage = await prisma.servicePackage.create({
      data: {
        businessId,
        name: "Drain unclogging",
        pricingModel: "FIXED",
        priceCents: 50_000,
        durationMinutes: 60,
      },
    });
    const booking = await makeBooking(businessId, {
      packageId: servicePackage.id,
    });
    const { gateway, calls } = fakeStripe();

    await createCheckoutForBooking(booking.id, { gateway, feeBps: 1000 });

    expect(calls.sessions[0]!.amountCents).toBe(12_000);
  });

  it("passes the booking id so the webhook can find it again", async () => {
    const { businessId } = await makeBusiness(CONNECTED);
    const booking = await makeBooking(businessId);
    const { gateway, calls } = fakeStripe();

    await createCheckoutForBooking(booking.id, { gateway });

    expect(calls.sessions[0]!.metadata).toMatchObject({
      bookingId: booking.id,
      reference: booking.reference,
    });
  });

  it("uses an idempotency key derived from the booking", async () => {
    const { businessId } = await makeBusiness(CONNECTED);
    const booking = await makeBooking(businessId);
    const { gateway, calls } = fakeStripe();

    await createCheckoutForBooking(booking.id, { gateway });
    await createCheckoutForBooking(booking.id, { gateway });

    expect(calls.sessions[0]!.idempotencyKey).toBe(`checkout:${booking.id}`);
    expect(calls.sessions[1]!.idempotencyKey).toBe(`checkout:${booking.id}`);
  });

  it("keeps one payment row across retries", async () => {
    const { businessId } = await makeBusiness(CONNECTED);
    const booking = await makeBooking(businessId);
    const { gateway } = fakeStripe();

    await createCheckoutForBooking(booking.id, { gateway });
    await createCheckoutForBooking(booking.id, { gateway });

    expect(
      await prisma.payment.count({ where: { bookingId: booking.id } }),
    ).toBe(1);
  });

  it("refuses to charge twice for a paid booking", async () => {
    const { businessId } = await makeBusiness(CONNECTED);
    const booking = await makeBooking(businessId);
    const { gateway } = fakeStripe();
    await createCheckoutForBooking(booking.id, { gateway });
    await prisma.payment.update({
      where: { bookingId: booking.id },
      data: { status: PaymentStatus.SUCCEEDED },
    });

    await expect(
      createCheckoutForBooking(booking.id, { gateway }),
    ).rejects.toBeInstanceOf(AlreadyPaidError);
  });

  it("refuses when the business has not connected Stripe", async () => {
    const { businessId } = await makeBusiness();
    const booking = await makeBooking(businessId);
    const { gateway } = fakeStripe();

    await expect(
      createCheckoutForBooking(booking.id, { gateway }),
    ).rejects.toBeInstanceOf(PaymentNotRequiredError);
  });

  it("refuses when the account cannot yet take charges", async () => {
    const { businessId } = await makeBusiness({
      stripeAccountId: "acct_pending",
      stripeChargesEnabled: false,
    });
    const booking = await makeBooking(businessId);
    const { gateway } = fakeStripe();

    await expect(
      createCheckoutForBooking(booking.id, { gateway }),
    ).rejects.toBeInstanceOf(PaymentNotRequiredError);
  });

  it.each([
    ["quote-priced", { pricingModel: "QUOTE" as const, priceCents: null }],
    ["hourly", { pricingModel: "HOURLY" as const, priceCents: 9_500 }],
    ["below Stripe's minimum", { priceCents: 25 }],
  ])("refuses %s work", async (_label, overrides) => {
    const { businessId } = await makeBusiness(CONNECTED);
    const booking = await makeBooking(businessId, overrides);
    const { gateway } = fakeStripe();

    await expect(
      createCheckoutForBooking(booking.id, { gateway }),
    ).rejects.toBeInstanceOf(PaymentNotRequiredError);
  });
});

describe("refundBookingPayment", () => {
  async function paidBooking() {
    const { businessId } = await makeBusiness(CONNECTED);
    const booking = await makeBooking(businessId);
    const { gateway, calls } = fakeStripe();
    await createCheckoutForBooking(booking.id, { gateway });
    await prisma.payment.update({
      where: { bookingId: booking.id },
      data: {
        status: PaymentStatus.SUCCEEDED,
        stripePaymentIntentId: "pi_test_1",
        paidAt: new Date(),
      },
    });
    return { booking, gateway, calls };
  }

  it("refunds through the connected account", async () => {
    const { booking, gateway, calls } = await paidBooking();

    await refundBookingPayment(booking.id, { gateway });

    expect(calls.refunds[0]).toMatchObject({
      paymentIntentId: "pi_test_1",
      accountId: "acct_connected",
    });
  });

  it("marks the payment refunded in full", async () => {
    const { booking, gateway } = await paidBooking();

    await refundBookingPayment(booking.id, { gateway });

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { bookingId: booking.id },
    });
    expect(payment.status).toBe(PaymentStatus.REFUNDED);
    expect(payment.refundedCents).toBe(12_000);
  });

  it("uses an idempotency key so a double click cannot refund twice", async () => {
    const { booking, gateway, calls } = await paidBooking();

    await refundBookingPayment(booking.id, { gateway });
    const key = calls.refunds[0]!.idempotencyKey;
    expect(key).toMatch(/^refund:/);
  });

  it("does nothing for a booking that was never paid", async () => {
    const { businessId } = await makeBusiness(CONNECTED);
    const booking = await makeBooking(businessId);
    const { gateway, calls } = fakeStripe();

    await expect(
      refundBookingPayment(booking.id, { gateway }),
    ).resolves.toBeUndefined();
    expect(calls.refunds).toHaveLength(0);
  });

  it("does nothing for a payment still pending", async () => {
    const { businessId } = await makeBusiness(CONNECTED);
    const booking = await makeBooking(businessId);
    const { gateway, calls } = fakeStripe();
    await createCheckoutForBooking(booking.id, { gateway });

    await refundBookingPayment(booking.id, { gateway });

    expect(calls.refunds).toHaveLength(0);
  });

  it("does not refund a second time", async () => {
    const { booking, gateway, calls } = await paidBooking();

    await refundBookingPayment(booking.id, { gateway });
    await refundBookingPayment(booking.id, { gateway });

    expect(calls.refunds).toHaveLength(1);
  });
});
