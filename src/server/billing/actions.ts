"use server";

import { revalidatePath } from "next/cache";

import {
  declineQuoteSchema,
  invoiceInputSchema,
  quoteInputSchema,
} from "@/lib/validations/billing";
import {
  AlreadyInvoicedError,
  InvoiceNotEditableError,
  createInvoice,
  invoiceFromQuote,
  sendInvoice,
  settleInvoice,
  updateInvoice,
  voidInvoice,
} from "@/server/billing/invoices";
import {
  QuoteNotAnswerableError,
  QuoteNotEditableError,
  answerQuote,
  createQuote,
  deleteQuote,
  sendQuote,
  updateQuote,
} from "@/server/billing/quotes";
import {
  ForbiddenError,
  NotFoundError,
  currentMembership,
} from "@/server/businesses/access";
import {
  sendInvoiceIssued,
  sendQuoteAnswered,
  sendQuoteSent,
} from "@/server/notifications/billing-mail";
import {
  AlreadyPaidError,
  PaymentNotRequiredError,
  createCheckoutForInvoice,
} from "@/server/payments/checkout";
import { getSession } from "@/server/session";

function invalid(message: string) {
  return { ok: false as const, error: message };
}

/** Known domain errors become messages; anything else is logged and hidden. */
function translate(error: unknown): string | null {
  if (
    error instanceof NotFoundError ||
    error instanceof ForbiddenError ||
    error instanceof QuoteNotEditableError ||
    error instanceof QuoteNotAnswerableError ||
    error instanceof InvoiceNotEditableError ||
    error instanceof AlreadyInvoicedError
  ) {
    return error.message;
  }
  return null;
}

async function providerMutation<T>(
  run: (context: { userId: string; businessId: string }) => Promise<T>,
) {
  const session = await getSession();
  if (!session) return invalid("Sign in to manage billing.");

  const membership = await currentMembership(session.user.id);
  if (!membership) return invalid("Set up your business first.");

  try {
    const data = await run({
      userId: session.user.id,
      businessId: membership.businessId,
    });
    revalidatePath("/quotes");
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    return { ok: true as const, data };
  } catch (error) {
    const message = translate(error);
    if (message) return invalid(message);
    console.error("[billing] unexpected failure:", error);
    return invalid("Something went wrong. Please try again.");
  }
}

// ── Quotes ───────────────────────────────────────────────────────────────

export async function createQuoteAction(input: unknown) {
  const parsed = quoteInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return providerMutation(async ({ userId, businessId }) => {
    const quote = await createQuote(userId, businessId, parsed.data);
    return { id: quote.id, reference: quote.reference };
  });
}

export async function updateQuoteAction(quoteId: string, input: unknown) {
  const parsed = quoteInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return providerMutation(({ userId, businessId }) =>
    updateQuote(userId, businessId, quoteId, parsed.data),
  );
}

export async function sendQuoteAction(quoteId: string) {
  return providerMutation(async ({ userId, businessId }) => {
    const quote = await sendQuote(userId, businessId, quoteId);
    // Mail is a notification, not the send itself: the quote is already
    // visible to anyone holding its link.
    await sendQuoteSent(quote.id).catch((error: unknown) => {
      console.error("[billing] quote mail failed:", error);
    });
    return { reference: quote.reference };
  });
}

export async function deleteQuoteAction(quoteId: string) {
  return providerMutation(({ userId, businessId }) =>
    deleteQuote(userId, businessId, quoteId),
  );
}

export async function invoiceQuoteAction(quoteId: string) {
  return providerMutation(async ({ userId, businessId }) => {
    const invoice = await invoiceFromQuote(userId, businessId, quoteId);
    return { id: invoice.id, reference: invoice.reference };
  });
}

/**
 * The customer's answer.
 *
 * Unauthenticated — holding the reference is the authorisation, exactly as
 * for a booking — so it takes the reference rather than an id.
 */
export async function answerQuoteAction(
  reference: string,
  answer: "accept" | "decline",
  input: unknown = {},
) {
  const parsed = declineQuoteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);

  try {
    const quote = await answerQuote(reference, answer, {
      reason: parsed.data.reason ?? null,
    });
    revalidatePath(`/quote/${reference}`);
    revalidatePath("/quotes");
    await sendQuoteAnswered(quote.id).catch((error: unknown) => {
      console.error("[billing] quote answer mail failed:", error);
    });
    return { ok: true as const, data: { status: quote.status } };
  } catch (error) {
    const message = translate(error);
    if (message) return invalid(message);
    console.error("[billing] answer failed:", error);
    return invalid("Could not record your answer. Please try again.");
  }
}

// ── Invoices ─────────────────────────────────────────────────────────────

export async function createInvoiceAction(input: unknown) {
  const parsed = invoiceInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return providerMutation(async ({ userId, businessId }) => {
    const invoice = await createInvoice(userId, businessId, parsed.data);
    return { id: invoice.id, reference: invoice.reference };
  });
}

export async function updateInvoiceAction(invoiceId: string, input: unknown) {
  const parsed = invoiceInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return providerMutation(({ userId, businessId }) =>
    updateInvoice(userId, businessId, invoiceId, parsed.data),
  );
}

export async function sendInvoiceAction(invoiceId: string) {
  return providerMutation(async ({ userId, businessId }) => {
    const invoice = await sendInvoice(userId, businessId, invoiceId);
    await sendInvoiceIssued(invoice.id).catch((error: unknown) => {
      console.error("[billing] invoice mail failed:", error);
    });
    return { reference: invoice.reference };
  });
}

export async function voidInvoiceAction(invoiceId: string) {
  return providerMutation(({ userId, businessId }) =>
    voidInvoice(userId, businessId, invoiceId),
  );
}

/** Mark a sent invoice paid in full, for payment taken outside Stripe. */
export async function settleInvoiceAction(invoiceId: string) {
  return providerMutation(({ userId, businessId }) =>
    settleInvoice(userId, businessId, invoiceId),
  );
}

/**
 * Start checkout for an invoice, as the customer.
 *
 * Unauthenticated like the rest of the customer-facing surface: holding the
 * reference is the authorisation.
 */
export async function payInvoiceAction(reference: string) {
  try {
    const { url } = await createCheckoutForInvoice(reference);
    return { ok: true as const, data: { url } };
  } catch (error) {
    if (
      error instanceof AlreadyPaidError ||
      error instanceof PaymentNotRequiredError ||
      error instanceof NotFoundError
    ) {
      return invalid(error.message);
    }
    console.error("[billing] invoice checkout failed:", error);
    return invalid("Could not start payment. Please try again.");
  }
}
