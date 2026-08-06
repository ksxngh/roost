import { randomBytes } from "node:crypto";

import { InvoiceStatus, QuoteStatus } from "@/generated/prisma/enums";
import type { InvoiceModel } from "@/generated/prisma/models";
import { documentTotals } from "@/lib/money";
import { generateReference } from "@/lib/validations/booking";
import type { InvoiceInput } from "@/lib/validations/billing";
import {
  NotFoundError,
  requireEditor,
  requireMembership,
} from "@/server/businesses/access";
import { prisma } from "@/server/db";

export class InvoiceNotEditableError extends Error {
  constructor(status: InvoiceStatus) {
    super(`A ${status.toLowerCase()} invoice can no longer be edited.`);
    this.name = "InvoiceNotEditableError";
  }
}

export class AlreadyInvoicedError extends Error {
  constructor() {
    super("This quote has already been invoiced.");
    this.name = "AlreadyInvoicedError";
  }
}

const EDITABLE: InvoiceStatus[] = [InvoiceStatus.DRAFT];
const ATTEMPTS = 5;

function dateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Allocate the next invoice number for a business.
 *
 * `{ increment: 1 }` compiles to `SET "invoiceCounter" = "invoiceCounter" + 1`,
 * which takes a row lock, so simultaneous callers serialise and each gets a
 * distinct number. Deriving it from `MAX(number)` instead is read-then-write:
 * six concurrent invoices all read the same maximum and then fight over one
 * number, which is exactly what a test here demonstrated.
 *
 * Numbers are never reused, including by a voided invoice — bookkeeping
 * expects a sequence that only goes up.
 */
async function allocateNumber(businessId: string): Promise<number> {
  const business = await prisma.business.update({
    where: { id: businessId },
    data: { invoiceCounter: { increment: 1 } },
    select: { invoiceCounter: true },
  });
  return business.invoiceCounter;
}

function documentFields(input: InvoiceInput) {
  const totals = documentTotals(input.lines, input.taxRateBps);
  return {
    title: input.title,
    notes: input.notes ?? null,
    customerName: input.customerName,
    customerEmail: input.customerEmail.toLowerCase(),
    customerPhone: input.customerPhone ?? null,
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city: input.city ?? null,
    region: input.region ?? null,
    postalCode: input.postalCode?.toUpperCase() ?? null,
    taxRateBps: input.taxRateBps,
    dueAt: dateOrNull(input.dueAt),
    ...totals,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === "P2002";
}

export async function createInvoice(
  userId: string,
  businessId: string,
  input: InvoiceInput,
  links: { quoteId?: string; bookingId?: string } = {},
): Promise<InvoiceModel> {
  await requireEditor(userId, businessId, "raise an invoice");

  const number = await allocateNumber(businessId);

  // Only the reference can now collide, and it is drawn from a CSPRNG — the
  // number is already settled by the counter.
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    try {
      return await prisma.invoice.create({
        data: {
          businessId,
          number,
          reference: generateReference(randomBytes),
          quoteId: links.quoteId ?? null,
          bookingId: links.bookingId ?? null,
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
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw new Error("Could not allocate an invoice reference");
}

/**
 * Turn an accepted quote into an invoice.
 *
 * The lines and totals are copied from the quote as accepted — re-deriving
 * them from anything current would let a price change after acceptance.
 */
export async function invoiceFromQuote(
  userId: string,
  businessId: string,
  quoteId: string,
): Promise<InvoiceModel> {
  await requireEditor(userId, businessId, "raise an invoice");

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    include: { lines: { orderBy: { position: "asc" } }, invoice: true },
  });
  if (!quote) throw new NotFoundError("quote");
  if (quote.invoice) throw new AlreadyInvoicedError();
  if (quote.status !== QuoteStatus.ACCEPTED) {
    throw new InvoiceNotEditableError(InvoiceStatus.VOID);
  }

  return createInvoice(
    userId,
    businessId,
    {
      title: quote.title,
      notes: quote.notes,
      customerName: quote.customerName,
      customerEmail: quote.customerEmail,
      customerPhone: quote.customerPhone,
      addressLine1: quote.addressLine1,
      addressLine2: quote.addressLine2,
      city: quote.city,
      region: quote.region,
      postalCode: quote.postalCode,
      taxRateBps: quote.taxRateBps,
      dueAt: null,
      lines: quote.lines.map((line) => ({
        description: line.description,
        quantityHundredths: line.quantityHundredths,
        unitPriceCents: line.unitPriceCents,
      })),
    },
    { quoteId: quote.id },
  );
}

export async function updateInvoice(
  userId: string,
  businessId: string,
  invoiceId: string,
  input: InvoiceInput,
): Promise<void> {
  await requireEditor(userId, businessId, "edit an invoice");

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, businessId },
    select: { id: true, status: true },
  });
  if (!invoice) throw new NotFoundError("invoice");
  if (!EDITABLE.includes(invoice.status)) {
    throw new InvoiceNotEditableError(invoice.status);
  }

  await prisma.$transaction([
    prisma.invoiceLine.deleteMany({ where: { invoiceId } }),
    prisma.invoice.update({
      where: { id: invoiceId },
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

export async function sendInvoice(
  userId: string,
  businessId: string,
  invoiceId: string,
): Promise<InvoiceModel> {
  await requireEditor(userId, businessId, "send an invoice");

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, businessId },
    select: { id: true, status: true },
  });
  if (!invoice) throw new NotFoundError("invoice");
  if (invoice.status !== InvoiceStatus.DRAFT) {
    throw new InvoiceNotEditableError(invoice.status);
  }

  return prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: InvoiceStatus.SENT, sentAt: new Date() },
  });
}

/**
 * Withdraw an issued invoice.
 *
 * Voided rather than deleted: an invoice that reached a customer is a record,
 * and its number must not be reused.
 */
export async function voidInvoice(
  userId: string,
  businessId: string,
  invoiceId: string,
): Promise<void> {
  await requireEditor(userId, businessId, "void an invoice");

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, businessId },
    select: { id: true, status: true },
  });
  if (!invoice) throw new NotFoundError("invoice");
  if (invoice.status === InvoiceStatus.PAID) {
    throw new InvoiceNotEditableError(invoice.status);
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: InvoiceStatus.VOID, voidedAt: new Date() },
  });
}

/** Record settlement. Driven by a verified Stripe webhook or by hand. */
export async function markInvoicePaid(
  invoiceId: string,
  amountCents: number,
  options: { paymentIntentId?: string | null; now?: Date } = {},
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, totalCents: true, amountPaidCents: true },
  });
  if (!invoice) return;

  const paid = invoice.amountPaidCents + amountCents;
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      amountPaidCents: paid,
      // Only a fully settled invoice is PAID; a part payment stays SENT with
      // a balance, rather than looking closed.
      ...(paid >= invoice.totalCents
        ? { status: InvoiceStatus.PAID, paidAt: options.now ?? new Date() }
        : {}),
      ...(options.paymentIntentId
        ? { stripePaymentIntentId: options.paymentIntentId }
        : {}),
    },
  });
}

export async function listInvoices(userId: string, businessId: string) {
  await requireMembership(userId, businessId);
  return prisma.invoice.findMany({
    where: { businessId },
    include: { lines: { orderBy: { position: "asc" } } },
    orderBy: { number: "desc" },
  });
}

export async function getInvoice(
  userId: string,
  businessId: string,
  invoiceId: string,
) {
  await requireMembership(userId, businessId);
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, businessId },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!invoice) throw new NotFoundError("invoice");
  return invoice;
}

/** The customer's view. Drafts stay private. */
export async function getPublicInvoice(reference: string) {
  return prisma.invoice.findFirst({
    where: { reference, status: { not: InvoiceStatus.DRAFT } },
    select: {
      reference: true,
      number: true,
      title: true,
      notes: true,
      status: true,
      dueAt: true,
      subtotalCents: true,
      taxRateBps: true,
      taxCents: true,
      totalCents: true,
      amountPaidCents: true,
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
        select: {
          name: true,
          slug: true,
          phone: true,
          email: true,
          stripeAccountId: true,
          stripeChargesEnabled: true,
        },
      },
    },
  });
}
