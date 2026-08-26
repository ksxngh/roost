// @vitest-environment node
/**
 * The webhook route trusts nothing until `constructEvent` verifies a payload's
 * signature. A Connect platform runs two event destinations — its own account
 * and connected accounts — each with a distinct signing secret, so the gateway
 * must accept an event signed by *either*. These tests sign payloads with the
 * real Stripe helper and check each secret is honoured.
 */
import Stripe from "stripe";
import { describe, expect, it } from "vitest";

import { createStripeGateway } from "@/server/payments/stripe";

const stripe = new Stripe("sk_test_dummy", {
  apiVersion: "2026-07-29.dahlia",
});

const PLATFORM_SECRET = "whsec_platform_secret";
const CONNECT_SECRET = "whsec_connect_secret";

function gatewayWith(env: {
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_CONNECT_WEBHOOK_SECRET?: string;
}) {
  return createStripeGateway({
    STRIPE_SECRET_KEY: "sk_test_dummy",
    ...env,
  } as unknown as Parameters<typeof createStripeGateway>[0]);
}

function sign(payload: string, secret: string) {
  return stripe.webhooks.generateTestHeaderString({ payload, secret });
}

const PAYLOAD = JSON.stringify({
  id: "evt_1",
  type: "checkout.session.completed",
  data: { object: { id: "cs_1" } },
});

describe("gateway constructEvent", () => {
  it("accepts an event signed with the platform secret", () => {
    const gateway = gatewayWith({
      STRIPE_WEBHOOK_SECRET: PLATFORM_SECRET,
      STRIPE_CONNECT_WEBHOOK_SECRET: CONNECT_SECRET,
    });
    const event = gateway.constructEvent(
      PAYLOAD,
      sign(PAYLOAD, PLATFORM_SECRET),
    );
    expect(event.type).toBe("checkout.session.completed");
  });

  it("accepts an event signed with the connect secret", () => {
    const gateway = gatewayWith({
      STRIPE_WEBHOOK_SECRET: PLATFORM_SECRET,
      STRIPE_CONNECT_WEBHOOK_SECRET: CONNECT_SECRET,
    });
    const event = gateway.constructEvent(
      PAYLOAD,
      sign(PAYLOAD, CONNECT_SECRET),
    );
    expect(event.id).toBe("evt_1");
  });

  it("rejects an event signed with neither secret", () => {
    const gateway = gatewayWith({
      STRIPE_WEBHOOK_SECRET: PLATFORM_SECRET,
      STRIPE_CONNECT_WEBHOOK_SECRET: CONNECT_SECRET,
    });
    expect(() =>
      gateway.constructEvent(PAYLOAD, sign(PAYLOAD, "whsec_wrong")),
    ).toThrow();
  });

  it("still verifies platform events when no connect secret is set", () => {
    const gateway = gatewayWith({ STRIPE_WEBHOOK_SECRET: PLATFORM_SECRET });
    const event = gateway.constructEvent(
      PAYLOAD,
      sign(PAYLOAD, PLATFORM_SECRET),
    );
    expect(event.type).toBe("checkout.session.completed");
  });
});
