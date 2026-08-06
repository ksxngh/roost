import { InvoiceStatus, PaymentStatus } from "@/generated/prisma/enums";
import type { PaymentModel } from "@/generated/prisma/models";
import { serverEnv } from "@/lib/env";
import { siteConfig } from "@/lib/site-config";
import { formatDuration } from "@/lib/validations/scheduling";
import {
  MIN_CHARGE_CENTS,
  isChargeable,
  platformFeeCents,
} from "@/lib/validations/payment";
import { balanceCents } from "@/lib/money";
import { NotFoundError } from "@/server/businesses/access";
import { prisma } from "@/server/db";
import { type StripeGateway, stripeGateway } from "@/server/payments/stripe";

export class PaymentNotRequiredError extends Error {
  constructor() {
    super("This booking does not take payment online.");
    this.name = "PaymentNotRequiredError";
  }
}

export class AlreadyPaidError extends Error {
  constructor() {
    super("This booking has already been paid.");
    this.name = "AlreadyPaidError";
  }
}

/**
 * Create (or reuse) a hosted checkout session for a booking.
 *
 * Hosted Checkout rather than embedded Elements: card details never touch our
 * origin, which keeps PCI scope at SAQ-A and means a compromised page cannot
 * skim a card number.
 *
 * The amount is read from the **booking**, not the current service package —
 * a business repricing mid-flow must not change what the customer agreed to.
 */
export async function createCheckoutForBooking(
  bookingId: string,
  deps: { gateway?: StripeGateway; appUrl?: string; feeBps?: number } = {},
): Promise<{ url: string; payment: PaymentModel }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      reference: true,
      packageName: true,
      pricingModel: true,
      priceCents: true,
      durationMinutes: true,
      customerEmail: true,
      businessId: true,
      payment: true,
      business: {
        select: {
          name: true,
          stripeAccountId: true,
          stripeChargesEnabled: true,
        },
      },
    },
  });
  if (!booking) throw new NotFoundError("booking");

  if (booking.payment?.status === PaymentStatus.SUCCEEDED) {
    throw new AlreadyPaidError();
  }

  const { business } = booking;
  if (
    !business.stripeAccountId ||
    !isChargeable({
      pricingModel: booking.pricingModel,
      priceCents: booking.priceCents,
      chargesEnabled: business.stripeChargesEnabled,
    })
  ) {
    throw new PaymentNotRequiredError();
  }

  const amountCents = booking.priceCents!;
  const feeBps = deps.feeBps ?? serverEnv().PLATFORM_FEE_BPS;
  const feeCents = platformFeeCents(amountCents, feeBps);
  const appUrl = deps.appUrl ?? siteConfig.url;

  const session = await (deps.gateway ?? stripeGateway()).createCheckoutSession(
    {
      accountId: business.stripeAccountId,
      amountCents,
      platformFeeCents: feeCents,
      currency: "cad",
      productName: booking.packageName,
      productDescription: `${formatDuration(booking.durationMinutes)} with ${business.name}`,
      customerEmail: booking.customerEmail,
      successUrl: `${appUrl}/booking/${booking.reference}?paid=1`,
      cancelUrl: `${appUrl}/booking/${booking.reference}`,
      // The webhook arrives with no context but this, so the booking id has to
      // travel with the session.
      metadata: { bookingId: booking.id, reference: booking.reference },
      // Keyed on the booking: a double-submitted form reuses the session that
      // already exists instead of creating a second charge.
      idempotencyKey: `checkout:${booking.id}`,
    },
  );

  // One payment row per booking, updated on retry rather than duplicated.
  const payment = await prisma.payment.upsert({
    where: { bookingId: booking.id },
    create: {
      bookingId: booking.id,
      stripeCheckoutSessionId: session.id,
      stripeAccountId: business.stripeAccountId,
      amountCents,
      platformFeeCents: feeCents,
      status: PaymentStatus.PENDING,
    },
    update: {
      stripeCheckoutSessionId: session.id,
      stripeAccountId: business.stripeAccountId,
      amountCents,
      platformFeeCents: feeCents,
      status: PaymentStatus.PENDING,
      failureReason: null,
    },
  });

  return { url: session.url, payment };
}

/**
 * Refund a booking the provider declined or cancelled.
 *
 * Silent when there is nothing to refund: a booking with no payment, or one
 * already refunded, is not an error worth surfacing to someone clicking
 * "decline".
 */
export async function refundBookingPayment(
  bookingId: string,
  deps: { gateway?: StripeGateway } = {},
): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { bookingId },
  });
  if (
    !payment ||
    payment.status !== PaymentStatus.SUCCEEDED ||
    !payment.stripePaymentIntentId
  ) {
    return;
  }

  await (deps.gateway ?? stripeGateway()).refund({
    paymentIntentId: payment.stripePaymentIntentId,
    accountId: payment.stripeAccountId,
    // Idempotent on the payment, so a double-click cannot refund twice.
    idempotencyKey: `refund:${payment.id}`,
  });

  // Stripe's `charge.refunded` webhook is authoritative and will confirm
  // this; writing it now keeps the provider's screen honest immediately.
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: PaymentStatus.REFUNDED,
      refundedCents: payment.amountCents,
    },
  });
}

/**
 * Hosted checkout for an invoice.
 *
 * Reuses the booking checkout's guarantees: charges are created on the
 * connected account with an application fee, the amount comes from the
 * *stored* invoice rather than anything recomputed, and the idempotency key
 * is derived from the invoice so a double-submitted payment cannot charge
 * twice.
 */
export async function createCheckoutForInvoice(
  reference: string,
  deps: { gateway?: StripeGateway; appUrl?: string; feeBps?: number } = {},
): Promise<{ url: string }> {
  const invoice = await prisma.invoice.findFirst({
    where: { reference, status: InvoiceStatus.SENT },
    select: {
      id: true,
      reference: true,
      number: true,
      title: true,
      totalCents: true,
      amountPaidCents: true,
      customerEmail: true,
      business: {
        select: {
          name: true,
          stripeAccountId: true,
          stripeChargesEnabled: true,
        },
      },
    },
  });
  if (!invoice) throw new NotFoundError("invoice");

  const outstanding = balanceCents(invoice.totalCents, invoice.amountPaidCents);
  if (outstanding <= 0) throw new AlreadyPaidError();

  const { business } = invoice;
  if (
    !business.stripeAccountId ||
    !business.stripeChargesEnabled ||
    outstanding < MIN_CHARGE_CENTS
  ) {
    throw new PaymentNotRequiredError();
  }

  const feeBps = deps.feeBps ?? serverEnv().PLATFORM_FEE_BPS;
  const appUrl = deps.appUrl ?? siteConfig.url;

  const session = await (deps.gateway ?? stripeGateway()).createCheckoutSession(
    {
      accountId: business.stripeAccountId,
      amountCents: outstanding,
      platformFeeCents: platformFeeCents(outstanding, feeBps),
      currency: "cad",
      productName: `Invoice #${invoice.number}`,
      productDescription: `${invoice.title} — ${business.name}`,
      customerEmail: invoice.customerEmail,
      successUrl: `${appUrl}/invoice/${invoice.reference}?paid=1`,
      cancelUrl: `${appUrl}/invoice/${invoice.reference}`,
      metadata: { invoiceId: invoice.id, reference: invoice.reference },
      // Keyed on what is owed as well as the invoice: a part payment followed
      // by a second attempt for the remainder is a different charge.
      idempotencyKey: `invoice:${invoice.id}:${outstanding}`,
    },
  );

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  return { url: session.url };
}
