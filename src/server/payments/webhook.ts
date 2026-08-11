import { PaymentStatus } from "@/generated/prisma/enums";
import { markInvoicePaid } from "@/server/billing/invoices";
import {
  applyStripeSubscription,
  cancelStripeSubscription,
} from "@/server/billing/subscription";
import { prisma } from "@/server/db";

/** Events this application acts on. Anything else is acknowledged and dropped. */
const HANDLED = new Set([
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_failed",
  "charge.refunded",
  "account.updated",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/** Pull the first price id off a Stripe subscription's items array. */
function firstPriceId(object: Record<string, unknown>): string | null {
  const items = (object.items as { data?: unknown[] } | undefined)?.data;
  const first = items?.[0] as { price?: { id?: string } } | undefined;
  return first?.price?.id ?? null;
}

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: unknown };
};

export type WebhookOutcome =
  | { handled: true; action: string }
  | { handled: false; reason: "duplicate" | "ignored" | "unknown-target" };

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

/**
 * Apply a verified Stripe event.
 *
 * The caller must have already checked the signature — this function trusts
 * its input entirely, which is why it is not exported to any route that has
 * not verified.
 *
 * Idempotency is enforced by inserting the event id first: Stripe retries
 * deliveries and explicitly does not promise exactly-once, so a duplicate
 * must not refund twice or double-confirm. The insert is the lock.
 */
export async function handleStripeEvent(
  event: StripeEvent,
): Promise<WebhookOutcome> {
  if (!HANDLED.has(event.type)) {
    return { handled: false, reason: "ignored" };
  }

  try {
    await prisma.stripeWebhookEvent.create({
      data: { id: event.id, type: event.type },
    });
  } catch (error) {
    // P2002: this event id is already recorded, so it has been applied.
    if ((error as { code?: string })?.code === "P2002") {
      return { handled: false, reason: "duplicate" };
    }
    throw error;
  }

  const object = asRecord(event.data.object);

  switch (event.type) {
    case "checkout.session.completed": {
      // A subscription checkout also completes here, but the subscription's own
      // events carry the status and period and do the real work, so this is
      // acknowledged and left alone.
      if (object.mode === "subscription") {
        return { handled: true, action: "subscription-checkout" };
      }

      const sessionId = String(object.id ?? "");
      const paymentIntentId =
        typeof object.payment_intent === "string"
          ? object.payment_intent
          : null;
      // `payment_status` distinguishes a completed session that actually paid
      // from one still awaiting an asynchronous method.
      const paid = object.payment_status === "paid";

      const { count } = await prisma.payment.updateMany({
        where: { stripeCheckoutSessionId: sessionId },
        data: {
          stripePaymentIntentId: paymentIntentId,
          status: paid ? PaymentStatus.SUCCEEDED : PaymentStatus.PENDING,
          paidAt: paid ? new Date() : null,
          failureReason: null,
        },
      });
      if (count > 0) {
        return {
          handled: true,
          action: paid ? "payment-succeeded" : "payment-pending",
        };
      }

      // The same event settles an invoice: invoices check out through the
      // same Stripe session mechanism but are tracked on their own row.
      if (paid) {
        const invoice = await prisma.invoice.findFirst({
          where: { stripeCheckoutSessionId: sessionId },
          select: { id: true, totalCents: true, amountPaidCents: true },
        });
        if (invoice) {
          // Trust Stripe's figure for what was actually collected; fall back
          // to the outstanding balance only if the event omits it.
          const collected =
            Number(object.amount_total ?? 0) ||
            invoice.totalCents - invoice.amountPaidCents;
          await markInvoicePaid(invoice.id, collected, { paymentIntentId });
          return { handled: true, action: "invoice-paid" };
        }
      }

      return { handled: false, reason: "unknown-target" };
    }

    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const sessionId = String(object.id ?? "");
      const { count } = await prisma.payment.updateMany({
        // A session that expires after the customer already paid must not
        // undo a successful payment.
        where: {
          stripeCheckoutSessionId: sessionId,
          status: PaymentStatus.PENDING,
        },
        data: {
          status: PaymentStatus.FAILED,
          failureReason:
            event.type === "checkout.session.expired"
              ? "Checkout expired before payment completed."
              : "The payment was declined.",
        },
      });
      if (count === 0) return { handled: false, reason: "unknown-target" };
      return { handled: true, action: "payment-failed" };
    }

    case "charge.refunded": {
      const paymentIntentId =
        typeof object.payment_intent === "string"
          ? object.payment_intent
          : null;
      if (!paymentIntentId) return { handled: false, reason: "unknown-target" };

      const refunded = Number(object.amount_refunded ?? 0);
      const { count } = await prisma.payment.updateMany({
        where: { stripePaymentIntentId: paymentIntentId },
        data: {
          status: PaymentStatus.REFUNDED,
          refundedCents: refunded,
        },
      });
      if (count === 0) return { handled: false, reason: "unknown-target" };
      return { handled: true, action: "payment-refunded" };
    }

    case "account.updated": {
      const accountId = String(object.id ?? "");
      const { count } = await prisma.business.updateMany({
        where: { stripeAccountId: accountId },
        data: {
          stripeChargesEnabled: Boolean(object.charges_enabled),
          stripePayoutsEnabled: Boolean(object.payouts_enabled),
          stripeDetailsSubmitted: Boolean(object.details_submitted),
        },
      });
      if (count === 0) return { handled: false, reason: "unknown-target" };
      return { handled: true, action: "account-updated" };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const { applied } = await applyStripeSubscription({
        id: String(object.id ?? ""),
        customerId: String(object.customer ?? ""),
        status: String(object.status ?? ""),
        priceId: firstPriceId(object),
        currentPeriodEnd:
          typeof object.current_period_end === "number"
            ? object.current_period_end
            : null,
        cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
        metadata: asRecord(object.metadata) as Record<string, string>,
      });
      if (!applied) return { handled: false, reason: "unknown-target" };
      return { handled: true, action: "subscription-updated" };
    }

    case "customer.subscription.deleted": {
      const { applied } = await cancelStripeSubscription(
        String(object.id ?? ""),
      );
      if (!applied) return { handled: false, reason: "unknown-target" };
      return { handled: true, action: "subscription-canceled" };
    }

    default:
      return { handled: false, reason: "ignored" };
  }
}
