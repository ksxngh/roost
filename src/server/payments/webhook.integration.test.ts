// @vitest-environment node
/**
 * Webhook handling.
 *
 * Stripe is the only thing that can tell us money moved, and this endpoint is
 * unauthenticated, so the signature is the whole security boundary. Stripe
 * also retries and does not promise exactly-once delivery, so a replayed
 * event must not refund or re-credit anything.
 */
import { createHmac, randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentStatus } from "@/generated/prisma/enums";
import { handleStripeEvent, type StripeEvent } from "@/server/payments/webhook";
import { prisma } from "@/server/db";

let seq = 0;

async function makeBusiness(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return prisma.business.create({
    data: {
      slug: `hook-biz-${Date.now()}-${seq}`,
      name: "Northside Plumbing",
      timezone: "America/Vancouver",
      ...overrides,
    },
  });
}

async function makePaidPending(businessId: string) {
  seq += 1;
  const booking = await prisma.booking.create({
    data: {
      reference: `HOOK${String(seq).padStart(4, "0")}`.slice(0, 8),
      businessId,
      packageName: "Drain unclogging",
      pricingModel: "FIXED",
      priceCents: 12_000,
      durationMinutes: 60,
      startAt: new Date(`2027-04-0${(seq % 8) + 1}T17:00:00Z`),
      endAt: new Date(`2027-04-0${(seq % 8) + 1}T18:00:00Z`),
      timezone: "America/Vancouver",
      customerName: "Dana Reyes",
      customerEmail: "dana@example.com",
      customerPhone: "604-555-0188",
      addressLine1: "12 Elm St",
      city: "Surrey",
      region: "BC",
      postalCode: "V3S 1A1",
    },
  });
  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      stripeCheckoutSessionId: `cs_${seq}_${Date.now()}`,
      stripeAccountId: "acct_connected",
      amountCents: 12_000,
      platformFeeCents: 1200,
      status: PaymentStatus.PENDING,
    },
  });
  return { booking, payment };
}

function event(
  type: string,
  object: Record<string, unknown>,
  id = `evt_${randomUUID()}`,
): StripeEvent {
  return { id, type, data: { object } };
}

beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("roost_test");
});

beforeEach(async () => {
  await prisma.stripeWebhookEvent.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.business.deleteMany();
});

describe("checkout.session.completed", () => {
  it("marks the payment succeeded and records the intent", async () => {
    const business = await makeBusiness();
    const { payment } = await makePaidPending(business.id);

    const outcome = await handleStripeEvent(
      event("checkout.session.completed", {
        id: payment.stripeCheckoutSessionId,
        payment_intent: "pi_test_9",
        payment_status: "paid",
      }),
    );

    expect(outcome).toEqual({ handled: true, action: "payment-succeeded" });
    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(stored.status).toBe(PaymentStatus.SUCCEEDED);
    expect(stored.stripePaymentIntentId).toBe("pi_test_9");
    expect(stored.paidAt).not.toBeNull();
  });

  it("does not mark paid when the session completed unpaid", async () => {
    const business = await makeBusiness();
    const { payment } = await makePaidPending(business.id);

    const outcome = await handleStripeEvent(
      event("checkout.session.completed", {
        id: payment.stripeCheckoutSessionId,
        payment_intent: "pi_test_9",
        payment_status: "unpaid",
      }),
    );

    expect(outcome).toEqual({ handled: true, action: "payment-pending" });
    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(stored.status).toBe(PaymentStatus.PENDING);
    expect(stored.paidAt).toBeNull();
  });

  it("ignores a session it has never heard of", async () => {
    const outcome = await handleStripeEvent(
      event("checkout.session.completed", {
        id: "cs_not_ours",
        payment_status: "paid",
      }),
    );
    expect(outcome).toEqual({ handled: false, reason: "unknown-target" });
  });
});

describe("idempotency", () => {
  it("applies an event once and skips the replay", async () => {
    const business = await makeBusiness();
    const { payment } = await makePaidPending(business.id);
    const delivered = event(
      "checkout.session.completed",
      {
        id: payment.stripeCheckoutSessionId,
        payment_intent: "pi_test_9",
        payment_status: "paid",
      },
      "evt_stable",
    );

    const first = await handleStripeEvent(delivered);
    const second = await handleStripeEvent(delivered);

    expect(first).toEqual({ handled: true, action: "payment-succeeded" });
    expect(second).toEqual({ handled: false, reason: "duplicate" });
  });

  it("does not refund twice when a refund event is replayed", async () => {
    const business = await makeBusiness();
    const { payment } = await makePaidPending(business.id);
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SUCCEEDED,
        stripePaymentIntentId: "pi_refund_me",
      },
    });
    const refundEvent = event(
      "charge.refunded",
      { payment_intent: "pi_refund_me", amount_refunded: 6_000 },
      "evt_refund_stable",
    );

    await handleStripeEvent(refundEvent);
    // A replay must not add another 6,000 to the refunded total.
    await handleStripeEvent(refundEvent);

    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(stored.refundedCents).toBe(6_000);
  });

  it("records every event it acts on", async () => {
    const business = await makeBusiness();
    const { payment } = await makePaidPending(business.id);

    await handleStripeEvent(
      event(
        "checkout.session.completed",
        { id: payment.stripeCheckoutSessionId, payment_status: "paid" },
        "evt_recorded",
      ),
    );

    const recorded = await prisma.stripeWebhookEvent.findUnique({
      where: { id: "evt_recorded" },
    });
    expect(recorded?.type).toBe("checkout.session.completed");
  });

  it("does not record an event type it ignores", async () => {
    const outcome = await handleStripeEvent(
      event("invoice.created", { id: "in_1" }, "evt_ignored"),
    );

    expect(outcome).toEqual({ handled: false, reason: "ignored" });
    expect(await prisma.stripeWebhookEvent.count()).toBe(0);
  });
});

describe("failure and expiry", () => {
  it.each([
    "checkout.session.expired",
    "checkout.session.async_payment_failed",
  ])("marks a pending payment failed on %s", async (type) => {
    const business = await makeBusiness();
    const { payment } = await makePaidPending(business.id);

    await handleStripeEvent(
      event(type, { id: payment.stripeCheckoutSessionId }),
    );

    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(stored.status).toBe(PaymentStatus.FAILED);
    expect(stored.failureReason).toBeTruthy();
  });

  it("never undoes a successful payment when a stale expiry arrives", async () => {
    const business = await makeBusiness();
    const { payment } = await makePaidPending(business.id);
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.SUCCEEDED, paidAt: new Date() },
    });

    const outcome = await handleStripeEvent(
      event("checkout.session.expired", {
        id: payment.stripeCheckoutSessionId,
      }),
    );

    expect(outcome).toEqual({ handled: false, reason: "unknown-target" });
    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(stored.status).toBe(PaymentStatus.SUCCEEDED);
  });
});

describe("charge.refunded", () => {
  it("records a partial refund at the amount Stripe reports", async () => {
    const business = await makeBusiness();
    const { payment } = await makePaidPending(business.id);
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SUCCEEDED,
        stripePaymentIntentId: "pi_partial",
      },
    });

    await handleStripeEvent(
      event("charge.refunded", {
        payment_intent: "pi_partial",
        amount_refunded: 4_500,
      }),
    );

    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(stored.status).toBe(PaymentStatus.REFUNDED);
    expect(stored.refundedCents).toBe(4_500);
  });

  it("ignores a refund with no payment intent", async () => {
    const outcome = await handleStripeEvent(
      event("charge.refunded", { amount_refunded: 100 }),
    );
    expect(outcome).toEqual({ handled: false, reason: "unknown-target" });
  });
});

describe("account.updated", () => {
  it("mirrors the capabilities Stripe reports", async () => {
    const business = await makeBusiness({
      stripeAccountId: "acct_watch",
      stripeChargesEnabled: false,
    });

    const outcome = await handleStripeEvent(
      event("account.updated", {
        id: "acct_watch",
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      }),
    );

    expect(outcome).toEqual({ handled: true, action: "account-updated" });
    const stored = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(stored.stripeChargesEnabled).toBe(true);
    expect(stored.stripePayoutsEnabled).toBe(true);
  });

  it("can switch a business back off", async () => {
    const business = await makeBusiness({
      stripeAccountId: "acct_off",
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    });

    await handleStripeEvent(
      event("account.updated", {
        id: "acct_off",
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: true,
      }),
    );

    const stored = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(stored.stripeChargesEnabled).toBe(false);
  });

  it("ignores an account belonging to no business here", async () => {
    const outcome = await handleStripeEvent(
      event("account.updated", { id: "acct_stranger", charges_enabled: true }),
    );
    expect(outcome).toEqual({ handled: false, reason: "unknown-target" });
  });
});

describe("POST /api/stripe/webhook", () => {
  /** Build the header Stripe sends, so verification runs for real. */
  function signedHeader(payload: string, secret: string, timestamp: number) {
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");
    return `t=${timestamp},v1=${signature}`;
  }

  const SECRET = "whsec_test_secret";

  async function callRoute(
    body: string,
    headers: Record<string, string>,
    env: Record<string, string | undefined> = {},
  ) {
    vi.resetModules();
    const previous = { ...process.env };
    Object.assign(process.env, {
      STRIPE_SECRET_KEY: "sk_test_dummy",
      STRIPE_WEBHOOK_SECRET: SECRET,
      ...env,
    });
    try {
      const { POST } = await import("@/app/api/stripe/webhook/route");
      return await POST(
        new Request("http://localhost/api/stripe/webhook", {
          method: "POST",
          body,
          headers,
        }),
      );
    } finally {
      process.env = previous;
    }
  }

  it("rejects a request with no signature", async () => {
    const response = await callRoute("{}", {});
    expect(response.status).toBe(400);
  });

  it("rejects a forged signature", async () => {
    const payload = JSON.stringify({
      id: "evt_forged",
      type: "checkout.session.completed",
      data: { object: { id: "cs_x", payment_status: "paid" } },
    });
    const response = await callRoute(payload, {
      "stripe-signature": signedHeader(
        payload,
        "whsec_wrong_secret",
        Math.floor(Date.now() / 1000),
      ),
    });

    expect(response.status).toBe(400);
    // Nothing was applied.
    expect(await prisma.stripeWebhookEvent.count()).toBe(0);
  });

  it("rejects a body altered after signing", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const original = JSON.stringify({ id: "evt_1", type: "account.updated" });
    const signature = signedHeader(original, SECRET, timestamp);

    const response = await callRoute(
      JSON.stringify({ id: "evt_1", type: "charge.refunded" }),
      { "stripe-signature": signature },
    );

    expect(response.status).toBe(400);
  });

  it("accepts and applies a correctly signed event", async () => {
    const business = await makeBusiness({ stripeAccountId: "acct_signed" });
    const payload = JSON.stringify({
      id: `evt_signed_${randomUUID()}`,
      type: "account.updated",
      data: {
        object: {
          id: "acct_signed",
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
        },
      },
    });

    const response = await callRoute(payload, {
      "stripe-signature": signedHeader(
        payload,
        SECRET,
        Math.floor(Date.now() / 1000),
      ),
    });

    expect(response.status).toBe(200);
    const stored = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(stored.stripeChargesEnabled).toBe(true);
  });

  it("rejects a replayed signature from outside the tolerance window", async () => {
    const payload = JSON.stringify({
      id: "evt_old",
      type: "account.updated",
      data: { object: { id: "acct_x" } },
    });
    // Stripe's default tolerance is five minutes.
    const oldTimestamp = Math.floor(Date.now() / 1000) - 60 * 60;

    const response = await callRoute(payload, {
      "stripe-signature": signedHeader(payload, SECRET, oldTimestamp),
    });

    expect(response.status).toBe(400);
  });

  it("refuses events when payments are not configured", async () => {
    const response = await callRoute(
      "{}",
      { "stripe-signature": "t=1,v1=abc" },
      { STRIPE_SECRET_KEY: undefined, STRIPE_WEBHOOK_SECRET: undefined },
    );
    expect(response.status).toBe(503);
  });
});
