import Stripe from "stripe";

import { serverEnv } from "@/lib/env";

/**
 * The slice of Stripe this application uses.
 *
 * Declared as an interface rather than reaching for the SDK type directly so
 * every payment path can be tested against a fake. Nothing here should grow
 * beyond what a caller genuinely needs — a narrow surface is what makes the
 * fake honest.
 */
export interface StripeGateway {
  createConnectedAccount(input: {
    email: string | null;
    businessName: string;
    country: string;
  }): Promise<{ id: string }>;

  createAccountLink(input: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<{ url: string }>;

  retrieveAccount(accountId: string): Promise<{
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
  }>;

  createCheckoutSession(input: {
    accountId: string;
    amountCents: number;
    platformFeeCents: number;
    currency: string;
    productName: string;
    productDescription: string;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
    /** Echoed back on the webhook so the event can find its booking. */
    metadata: Record<string, string>;
    /** Stripe rejects a duplicate key, which is what stops double charges. */
    idempotencyKey: string;
  }): Promise<{ id: string; url: string }>;

  refund(input: {
    paymentIntentId: string;
    accountId: string;
    amountCents?: number;
    idempotencyKey: string;
  }): Promise<{ id: string }>;

  /**
   * Verify and parse a webhook payload.
   *
   * Takes the raw body, never a parsed object: the signature covers the exact
   * bytes Stripe sent, and re-serializing JSON would break it.
   */
  constructEvent(
    payload: string,
    signature: string,
  ): { id: string; type: string; data: { object: unknown } };
}

/** Raised when payment configuration is missing rather than merely wrong. */
export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Payments are not configured on this deployment.");
    this.name = "StripeNotConfiguredError";
  }
}

let cached: Stripe | undefined;

export function stripeClient(env = serverEnv()): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new StripeNotConfiguredError();
  cached ??= new Stripe(env.STRIPE_SECRET_KEY, {
    // Pinned: an unpinned version means Stripe can change response shapes
    // under a running deployment.
    apiVersion: "2026-07-29.dahlia",
    typescript: true,
  });
  return cached;
}

/** Whether this deployment can take money at all. */
export function paymentsConfigured(env = serverEnv()): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

/**
 * The real gateway.
 *
 * Charges are created **on behalf of** the connected account (`stripeAccount`
 * header) with an application fee, so funds land in the provider's balance
 * and Roost's cut is separated by Stripe rather than by us moving money.
 */
export function createStripeGateway(env = serverEnv()): StripeGateway {
  const stripe = stripeClient(env);

  return {
    async createConnectedAccount({ email, businessName, country }) {
      const account = await stripe.accounts.create({
        type: "express",
        country,
        email: email ?? undefined,
        business_profile: { name: businessName },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      return { id: account.id };
    },

    async createAccountLink({ accountId, refreshUrl, returnUrl }) {
      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });
      return { url: link.url };
    },

    async retrieveAccount(accountId) {
      const account = await stripe.accounts.retrieve(accountId);
      return {
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
        detailsSubmitted: account.details_submitted ?? false,
      };
    },

    async createCheckoutSession(input) {
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          customer_email: input.customerEmail,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: input.currency,
                unit_amount: input.amountCents,
                product_data: {
                  name: input.productName,
                  description: input.productDescription,
                },
              },
            },
          ],
          payment_intent_data: {
            application_fee_amount: input.platformFeeCents,
          },
          metadata: input.metadata,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
        },
        {
          stripeAccount: input.accountId,
          idempotencyKey: input.idempotencyKey,
        },
      );
      if (!session.url) {
        throw new Error("Stripe returned a checkout session with no URL");
      }
      return { id: session.id, url: session.url };
    },

    async refund({ paymentIntentId, accountId, amountCents, idempotencyKey }) {
      const refund = await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          ...(amountCents === undefined ? {} : { amount: amountCents }),
          // Give the platform fee back too: Roost should not keep a cut of
          // work that never happened.
          refund_application_fee: true,
        },
        { stripeAccount: accountId, idempotencyKey },
      );
      return { id: refund.id };
    },

    constructEvent(payload, signature) {
      if (!env.STRIPE_WEBHOOK_SECRET) throw new StripeNotConfiguredError();
      return stripe.webhooks.constructEvent(
        payload,
        signature,
        env.STRIPE_WEBHOOK_SECRET,
      ) as { id: string; type: string; data: { object: unknown } };
    },
  };
}

let gateway: StripeGateway | undefined;

/** Process-wide gateway, created lazily so an unconfigured app still boots. */
export function stripeGateway(): StripeGateway {
  gateway ??= createStripeGateway();
  return gateway;
}
