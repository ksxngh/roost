import { randomBytes } from "node:crypto";

import { QuoteStatus } from "@/generated/prisma/enums";
import type { QuoteModel } from "@/generated/prisma/models";
import { documentTotals } from "@/lib/money";
import { generateReference } from "@/lib/validations/booking";
import type { QuoteInput } from "@/lib/validations/billing";
import {
  MemberCapability,
  NotFoundError,
  requireCapability,
  requireMembership,
} from "@/server/businesses/access";
import { linkClient } from "@/server/businesses/clients";
import { prisma } from "@/server/db";

export class QuoteNotEditableError extends Error {
  constructor(status: QuoteStatus) {
    super(`A ${status.toLowerCase()} quote can no longer be edited.`);
    this.name = "QuoteNotEditableError";
  }
}

export class QuoteNotAnswerableError extends Error {
  constructor(status: QuoteStatus) {
    super(`This quote is ${status.toLowerCase()} and cannot be answered.`);
    this.name = "QuoteNotAnswerableError";
  }
}

/** Only a draft can be rewritten; a sent quote is a document someone has. */
const EDITABLE: QuoteStatus[] = [QuoteStatus.DRAFT];

const REFERENCE_ATTEMPTS = 5;

function dateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Parsed as UTC midnight: an expiry is a calendar day, not an instant.
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function documentFields(input: QuoteInput) {
  const totals = documentTotals(input.lines, input.taxRateBps);
  return {
    title: input.title,
    notes: input.notes ?? null,
    internalNote: input.internalNote ?? null,
    customerName: input.customerName,
    customerEmail: input.customerEmail.toLowerCase(),
    customerPhone: input.customerPhone ?? null,
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city: input.city ?? null,
    region: input.region ?? null,
    postalCode: input.postalCode?.toUpperCase() ?? null,
    taxRateBps: input.taxRateBps,
    depositCents: input.depositCents,
    validUntil: dateOrNull(input.validUntil),
    ...totals,
  };
}

export async function createQuote(
  userId: string,
  businessId: string,
  input: QuoteInput,
): Promise<QuoteModel> {
  await requireCapability(
    userId,
    businessId,
    MemberCapability.BILLING,
    "write a quote",
  );

  // The client record is derived from the document, not chosen on a form.
  const clientId = await linkClient(businessId, {
    email: input.customerEmail,
    name: input.customerName,
    phone: input.customerPhone,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    city: input.city,
    region: input.region,
    postalCode: input.postalCode,
  });

  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.quote.create({
        data: {
          businessId,
          clientId,
          reference: generateReference(randomBytes),
          ...documentFields(input),
          lines: {
            create: input.lines.map((line, position) => ({
              description: line.description,
              quantityHundredths: line.quantityHundredths,
              unitPriceCents: line.unitPriceCents,
              position,
            })),
          },
        },
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Could not allocate a quote reference");
}

/**
 * Rewrite a draft.
 *
 * Lines are replaced wholesale rather than diffed: a quote is one document,
 * and a partial update could leave totals that do not match the rows.
 */
export async function updateQuote(
  userId: string,
  businessId: string,
  quoteId: string,
  input: QuoteInput,
): Promise<void> {
  await requireCapability(
    userId,
    businessId,
    MemberCapability.BILLING,
    "edit a quote",
  );

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: { id: true, status: true },
  });
  if (!quote) throw new NotFoundError("quote");
  if (!EDITABLE.includes(quote.status)) {
    throw new QuoteNotEditableError(quote.status);
  }

  await prisma.$transaction([
    prisma.quoteLine.deleteMany({ where: { quoteId } }),
    prisma.quote.update({
      where: { id: quoteId },
      data: {
        ...documentFields(input),
        lines: {
          create: input.lines.map((line, position) => ({
            description: line.description,
            quantityHundredths: line.quantityHundredths,
            unitPriceCents: line.unitPriceCents,
            position,
          })),
        },
      },
    }),
  ]);
}

/** Hand the quote to the customer. Only a draft can be sent. */
export async function sendQuote(
  userId: string,
  businessId: string,
  quoteId: string,
): Promise<QuoteModel> {
  await requireCapability(
    userId,
    businessId,
    MemberCapability.BILLING,
    "send a quote",
  );

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: { id: true, status: true },
  });
  if (!quote) throw new NotFoundError("quote");
  if (quote.status !== QuoteStatus.DRAFT) {
    throw new QuoteNotEditableError(quote.status);
  }

  return prisma.quote.update({
    where: { id: quote.id },
    data: { status: QuoteStatus.SENT, sentAt: new Date() },
  });
}

export async function deleteQuote(
  userId: string,
  businessId: string,
  quoteId: string,
): Promise<void> {
  await requireCapability(
    userId,
    businessId,
    MemberCapability.BILLING,
    "delete a quote",
  );
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: { id: true, status: true },
  });
  if (!quote) return;
  // A sent quote is a document the customer holds; withdrawing it is a
  // decline, not a deletion.
  if (!EDITABLE.includes(quote.status)) {
    throw new QuoteNotEditableError(quote.status);
  }
  await prisma.quote.delete({ where: { id: quote.id } });
}

export async function listQuotes(userId: string, businessId: string) {
  await requireMembership(userId, businessId);
  return prisma.quote.findMany({
    where: { businessId },
    include: { lines: { orderBy: { position: "asc" } }, invoice: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getQuote(
  userId: string,
  businessId: string,
  quoteId: string,
) {
  await requireMembership(userId, businessId);
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    include: { lines: { orderBy: { position: "asc" } }, invoice: true },
  });
  if (!quote) throw new NotFoundError("quote");
  return quote;
}

/**
 * The customer's view, by reference.
 *
 * A draft is invisible: until it is sent it is the provider's working copy.
 * `internalNote` is never selected.
 */
export async function getPublicQuote(reference: string) {
  const quote = await prisma.quote.findFirst({
    where: {
      reference,
      status: { not: QuoteStatus.DRAFT },
    },
    select: {
      reference: true,
      title: true,
      notes: true,
      status: true,
      validUntil: true,
      subtotalCents: true,
      taxRateBps: true,
      taxCents: true,
      totalCents: true,
      depositCents: true,
      declineReason: true,
      customerName: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      postalCode: true,
      lines: {
        select: {
          id: true,
          description: true,
          quantityHundredths: true,
          unitPriceCents: true,
        },
        orderBy: { position: "asc" },
      },
      business: {
        select: { name: true, slug: true, phone: true, email: true },
      },
      invoice: { select: { reference: true } },
    },
  });
  return quote;
}

/** Statuses a customer may still answer from. */
const ANSWERABLE: QuoteStatus[] = [QuoteStatus.SENT];

/**
 * Accept or decline, as the customer.
 *
 * Authorised by holding the reference, exactly like a booking: the customer
 * has no account. Expiry is checked here rather than trusted from the stored
 * status, because the sweep that marks quotes expired runs on a schedule and
 * may not have caught up.
 */
export async function answerQuote(
  reference: string,
  answer: "accept" | "decline",
  options: { reason?: string | null; now?: Date } = {},
): Promise<QuoteModel> {
  const now = options.now ?? new Date();

  const quote = await prisma.quote.findUnique({
    where: { reference },
    select: { id: true, status: true, validUntil: true },
  });
  if (!quote) throw new NotFoundError("quote");
  if (!ANSWERABLE.includes(quote.status)) {
    throw new QuoteNotAnswerableError(quote.status);
  }
  if (quote.validUntil && quote.validUntil.getTime() < now.getTime()) {
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: QuoteStatus.EXPIRED },
    });
    throw new QuoteNotAnswerableError(QuoteStatus.EXPIRED);
  }

  return prisma.quote.update({
    where: { id: quote.id },
    data: {
      status: answer === "accept" ? QuoteStatus.ACCEPTED : QuoteStatus.DECLINED,
      respondedAt: now,
      declineReason: answer === "decline" ? (options.reason ?? null) : null,
    },
  });
}
