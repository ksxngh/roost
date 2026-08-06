// @vitest-environment node
/**
 * Quotes and invoices.
 *
 * The properties that matter: a document a customer holds cannot be rewritten
 * under them, totals stored match the lines stored, invoice numbers never
 * collide or repeat, and nothing crosses a business boundary.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  BusinessRole,
  InvoiceStatus,
  QuoteStatus,
} from "@/generated/prisma/enums";
import { documentTotals } from "@/lib/money";
import { ForbiddenError, NotFoundError } from "@/server/businesses/access";
import {
  AlreadyInvoicedError,
  InvoiceNotEditableError,
  createInvoice,
  getPublicInvoice,
  invoiceFromQuote,
  listInvoices,
  markInvoicePaid,
  sendInvoice,
  updateInvoice,
  voidInvoice,
} from "@/server/billing/invoices";
import {
  QuoteNotAnswerableError,
  QuoteNotEditableError,
  answerQuote,
  createQuote,
  deleteQuote,
  getPublicQuote,
  listQuotes,
  sendQuote,
  updateQuote,
} from "@/server/billing/quotes";
import { prisma } from "@/server/db";

let seq = 0;

async function makeUser() {
  seq += 1;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      name: `User ${seq}`,
      email: `bill-${Date.now()}-${seq}@example.com`,
      emailVerified: true,
    },
  });
}

async function makeBusiness() {
  seq += 1;
  const user = await makeUser();
  const business = await prisma.business.create({
    data: {
      slug: `bill-biz-${Date.now()}-${seq}`,
      name: "Northside Plumbing",
      email: "hello@northside.example",
      timezone: "America/Vancouver",
      members: { create: { userId: user.id, role: BusinessRole.OWNER } },
    },
  });
  return { userId: user.id, businessId: business.id };
}

const QUOTE = {
  title: "Bathroom re-pipe",
  notes: "Includes fixtures.",
  internalNote: "Awkward crawlspace",
  customerName: "Dana Reyes",
  customerEmail: "Dana@Example.com",
  customerPhone: "604-555-0188",
  addressLine1: "12 Elm St",
  addressLine2: null,
  city: "Surrey",
  region: "bc",
  postalCode: "v3s 1a1",
  taxRateBps: 1_200,
  depositCents: 20_000,
  validUntil: null,
  lines: [
    { description: "Labour", quantityHundredths: 800, unitPriceCents: 9_500 },
    {
      description: "Fixtures",
      quantityHundredths: 100,
      unitPriceCents: 42_000,
    },
  ],
};

const INVOICE = {
  title: "Bathroom re-pipe",
  notes: null,
  customerName: "Dana Reyes",
  customerEmail: "dana@example.com",
  customerPhone: null,
  addressLine1: "12 Elm St",
  addressLine2: null,
  city: "Surrey",
  region: "BC",
  postalCode: "V3S 1A1",
  taxRateBps: 1_200,
  dueAt: null,
  lines: [
    { description: "Labour", quantityHundredths: 800, unitPriceCents: 9_500 },
  ],
};

beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("roost_test");
});

beforeEach(async () => {
  await prisma.invoice.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.business.deleteMany();
  await prisma.user.deleteMany();
});

describe("createQuote", () => {
  it("stores totals that match its lines", async () => {
    const { userId, businessId } = await makeBusiness();
    const quote = await createQuote(userId, businessId, QUOTE);

    const expected = documentTotals(QUOTE.lines, QUOTE.taxRateBps);
    expect(quote.subtotalCents).toBe(expected.subtotalCents);
    expect(quote.taxCents).toBe(expected.taxCents);
    expect(quote.totalCents).toBe(expected.totalCents);
    // 8 hrs @ $95 + 1 × $420 = $1,180.00; 12% tax = $141.60
    expect(quote.totalCents).toBe(118_000 + 14_160);
  });

  it("starts as a draft the customer cannot see", async () => {
    const { userId, businessId } = await makeBusiness();
    const quote = await createQuote(userId, businessId, QUOTE);

    expect(quote.status).toBe(QuoteStatus.DRAFT);
    expect(await getPublicQuote(quote.reference)).toBeNull();
  });

  it("normalises the email, province, and postal code", async () => {
    const { userId, businessId } = await makeBusiness();
    const quote = await createQuote(userId, businessId, QUOTE);

    expect(quote.customerEmail).toBe("dana@example.com");
    expect(quote.postalCode).toBe("V3S 1A1");
  });

  it("keeps the lines in the order they were given", async () => {
    const { userId, businessId } = await makeBusiness();
    const quote = await createQuote(userId, businessId, QUOTE);

    const lines = await prisma.quoteLine.findMany({
      where: { quoteId: quote.id },
      orderBy: { position: "asc" },
    });
    expect(lines.map((line) => line.description)).toEqual([
      "Labour",
      "Fixtures",
    ]);
  });

  it("gives each quote a distinct reference", async () => {
    const { userId, businessId } = await makeBusiness();
    const references = new Set<string>();
    for (let index = 0; index < 5; index += 1) {
      references.add((await createQuote(userId, businessId, QUOTE)).reference);
    }
    expect(references.size).toBe(5);
  });

  it("refuses a MEMBER", async () => {
    const { businessId } = await makeBusiness();
    const member = await makeUser();
    await prisma.businessMember.create({
      data: { businessId, userId: member.id, role: BusinessRole.MEMBER },
    });

    await expect(
      createQuote(member.id, businessId, QUOTE),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("editing a quote", () => {
  it("replaces lines and recomputes totals", async () => {
    const { userId, businessId } = await makeBusiness();
    const quote = await createQuote(userId, businessId, QUOTE);

    await updateQuote(userId, businessId, quote.id, {
      ...QUOTE,
      lines: [
        {
          description: "Labour",
          quantityHundredths: 200,
          unitPriceCents: 9_500,
        },
      ],
    });

    const stored = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
      include: { lines: true },
    });
    expect(stored.lines).toHaveLength(1);
    expect(stored.subtotalCents).toBe(19_000);
    expect(stored.totalCents).toBe(19_000 + 2_280);
  });

  it("refuses to rewrite a quote the customer already has", async () => {
    const { userId, businessId } = await makeBusiness();
    const quote = await createQuote(userId, businessId, QUOTE);
    await sendQuote(userId, businessId, quote.id);

    await expect(
      updateQuote(userId, businessId, quote.id, QUOTE),
    ).rejects.toBeInstanceOf(QuoteNotEditableError);
  });

  it("refuses to delete a sent quote", async () => {
    const { userId, businessId } = await makeBusiness();
    const quote = await createQuote(userId, businessId, QUOTE);
    await sendQuote(userId, businessId, quote.id);

    await expect(
      deleteQuote(userId, businessId, quote.id),
    ).rejects.toBeInstanceOf(QuoteNotEditableError);
  });

  it("deletes a draft", async () => {
    const { userId, businessId } = await makeBusiness();
    const quote = await createQuote(userId, businessId, QUOTE);

    await deleteQuote(userId, businessId, quote.id);

    expect(await prisma.quote.count()).toBe(0);
  });

  it("refuses to edit another business's quote", async () => {
    const mine = await makeBusiness();
    const theirs = await makeBusiness();
    const quote = await createQuote(theirs.userId, theirs.businessId, QUOTE);

    await expect(
      updateQuote(mine.userId, mine.businessId, quote.id, QUOTE),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("the customer's view of a quote", () => {
  async function sentQuote() {
    const business = await makeBusiness();
    const quote = await createQuote(
      business.userId,
      business.businessId,
      QUOTE,
    );
    await sendQuote(business.userId, business.businessId, quote.id);
    return { ...business, quote };
  }

  it("appears once sent", async () => {
    const { quote } = await sentQuote();
    const view = await getPublicQuote(quote.reference);

    expect(view?.title).toBe("Bathroom re-pipe");
    expect(view?.lines).toHaveLength(2);
    expect(view?.business.name).toBe("Northside Plumbing");
  });

  it("never exposes the internal note or the customer's own contact details", async () => {
    const { quote } = await sentQuote();
    const view = await getPublicQuote(quote.reference);

    expect(view).not.toHaveProperty("internalNote");
    expect(view).not.toHaveProperty("customerEmail");
    expect(view).not.toHaveProperty("customerPhone");
    expect(view).not.toHaveProperty("id");
  });

  it("accepts", async () => {
    const { quote } = await sentQuote();
    const answered = await answerQuote(quote.reference, "accept");

    expect(answered.status).toBe(QuoteStatus.ACCEPTED);
    expect(answered.respondedAt).not.toBeNull();
  });

  it("declines with a reason", async () => {
    const { quote } = await sentQuote();
    const answered = await answerQuote(quote.reference, "decline", {
      reason: "Went with someone else",
    });

    expect(answered.status).toBe(QuoteStatus.DECLINED);
    expect(answered.declineReason).toBe("Went with someone else");
  });

  it("cannot be answered twice", async () => {
    const { quote } = await sentQuote();
    await answerQuote(quote.reference, "accept");

    await expect(
      answerQuote(quote.reference, "decline"),
    ).rejects.toBeInstanceOf(QuoteNotAnswerableError);
  });

  it("cannot be answered while still a draft", async () => {
    const business = await makeBusiness();
    const quote = await createQuote(
      business.userId,
      business.businessId,
      QUOTE,
    );

    await expect(answerQuote(quote.reference, "accept")).rejects.toBeInstanceOf(
      QuoteNotAnswerableError,
    );
  });

  it("cannot be accepted after it expires, even before the sweep runs", async () => {
    const business = await makeBusiness();
    const quote = await createQuote(business.userId, business.businessId, {
      ...QUOTE,
      validUntil: "2026-01-01",
    });
    await sendQuote(business.userId, business.businessId, quote.id);

    await expect(
      answerQuote(quote.reference, "accept", {
        now: new Date("2026-06-01T00:00:00Z"),
      }),
    ).rejects.toBeInstanceOf(QuoteNotAnswerableError);

    const stored = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
    });
    expect(stored.status).toBe(QuoteStatus.EXPIRED);
  });

  it("can still be accepted on its final day", async () => {
    const business = await makeBusiness();
    const quote = await createQuote(business.userId, business.businessId, {
      ...QUOTE,
      validUntil: "2026-06-30",
    });
    await sendQuote(business.userId, business.businessId, quote.id);

    const answered = await answerQuote(quote.reference, "accept", {
      now: new Date("2026-06-29T12:00:00Z"),
    });
    expect(answered.status).toBe(QuoteStatus.ACCEPTED);
  });

  it("is not found for an unknown reference", async () => {
    await expect(answerQuote("AAAAAAAA", "accept")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("invoice numbering", () => {
  it("starts at one and increments per business", async () => {
    const { userId, businessId } = await makeBusiness();

    const first = await createInvoice(userId, businessId, INVOICE);
    const second = await createInvoice(userId, businessId, INVOICE);

    expect(first.number).toBe(1);
    expect(second.number).toBe(2);
  });

  it("numbers each business independently", async () => {
    const mine = await makeBusiness();
    const theirs = await makeBusiness();

    const a = await createInvoice(mine.userId, mine.businessId, INVOICE);
    const b = await createInvoice(theirs.userId, theirs.businessId, INVOICE);

    expect(a.number).toBe(1);
    expect(b.number).toBe(1);
  });

  it("gives every concurrent invoice a distinct number", async () => {
    const { userId, businessId } = await makeBusiness();

    // All six read the current maximum before any of them writes.
    const created = await Promise.all(
      Array.from({ length: 6 }, () =>
        createInvoice(userId, businessId, INVOICE),
      ),
    );

    const numbers = created.map((invoice) => invoice.number);
    expect(new Set(numbers).size).toBe(6);
    expect([...numbers].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("does not reuse the number of a voided invoice", async () => {
    const { userId, businessId } = await makeBusiness();
    const first = await createInvoice(userId, businessId, INVOICE);
    await sendInvoice(userId, businessId, first.id);
    await voidInvoice(userId, businessId, first.id);

    const second = await createInvoice(userId, businessId, INVOICE);
    expect(second.number).toBe(first.number + 1);
  });
});

describe("invoicing a quote", () => {
  async function acceptedQuote() {
    const business = await makeBusiness();
    const quote = await createQuote(
      business.userId,
      business.businessId,
      QUOTE,
    );
    await sendQuote(business.userId, business.businessId, quote.id);
    await answerQuote(quote.reference, "accept");
    return { ...business, quote };
  }

  it("copies the lines and totals as accepted", async () => {
    const { userId, businessId, quote } = await acceptedQuote();

    const invoice = await invoiceFromQuote(userId, businessId, quote.id);
    const lines = await prisma.invoiceLine.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { position: "asc" },
    });

    expect(invoice.totalCents).toBe(quote.totalCents);
    expect(invoice.taxRateBps).toBe(quote.taxRateBps);
    expect(lines.map((line) => line.description)).toEqual([
      "Labour",
      "Fixtures",
    ]);
  });

  it("links the invoice back to the quote", async () => {
    const { userId, businessId, quote } = await acceptedQuote();
    const invoice = await invoiceFromQuote(userId, businessId, quote.id);

    expect(invoice.quoteId).toBe(quote.id);
    const view = await getPublicQuote(quote.reference);
    expect(view?.invoice?.reference).toBe(invoice.reference);
  });

  it("refuses to invoice the same quote twice", async () => {
    const { userId, businessId, quote } = await acceptedQuote();
    await invoiceFromQuote(userId, businessId, quote.id);

    await expect(
      invoiceFromQuote(userId, businessId, quote.id),
    ).rejects.toBeInstanceOf(AlreadyInvoicedError);
  });

  it("refuses to invoice a quote nobody accepted", async () => {
    const business = await makeBusiness();
    const quote = await createQuote(
      business.userId,
      business.businessId,
      QUOTE,
    );
    await sendQuote(business.userId, business.businessId, quote.id);

    await expect(
      invoiceFromQuote(business.userId, business.businessId, quote.id),
    ).rejects.toBeInstanceOf(InvoiceNotEditableError);
  });

  it("refuses to invoice another business's quote", async () => {
    const mine = await makeBusiness();
    const theirs = await acceptedQuote();

    await expect(
      invoiceFromQuote(mine.userId, mine.businessId, theirs.quote.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("invoice lifecycle", () => {
  it("is invisible to the customer until sent", async () => {
    const { userId, businessId } = await makeBusiness();
    const invoice = await createInvoice(userId, businessId, INVOICE);

    expect(await getPublicInvoice(invoice.reference)).toBeNull();

    await sendInvoice(userId, businessId, invoice.id);
    expect(await getPublicInvoice(invoice.reference)).not.toBeNull();
  });

  it("refuses to edit once sent", async () => {
    const { userId, businessId } = await makeBusiness();
    const invoice = await createInvoice(userId, businessId, INVOICE);
    await sendInvoice(userId, businessId, invoice.id);

    await expect(
      updateInvoice(userId, businessId, invoice.id, INVOICE),
    ).rejects.toBeInstanceOf(InvoiceNotEditableError);
  });

  it("voids rather than deletes", async () => {
    const { userId, businessId } = await makeBusiness();
    const invoice = await createInvoice(userId, businessId, INVOICE);
    await sendInvoice(userId, businessId, invoice.id);

    await voidInvoice(userId, businessId, invoice.id);

    const stored = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(stored.status).toBe(InvoiceStatus.VOID);
    expect(stored.voidedAt).not.toBeNull();
  });

  it("refuses to void a paid invoice", async () => {
    const { userId, businessId } = await makeBusiness();
    const invoice = await createInvoice(userId, businessId, INVOICE);
    await sendInvoice(userId, businessId, invoice.id);
    await markInvoicePaid(invoice.id, invoice.totalCents);

    await expect(
      voidInvoice(userId, businessId, invoice.id),
    ).rejects.toBeInstanceOf(InvoiceNotEditableError);
  });

  it("marks a fully settled invoice paid", async () => {
    const { userId, businessId } = await makeBusiness();
    const invoice = await createInvoice(userId, businessId, INVOICE);
    await sendInvoice(userId, businessId, invoice.id);

    await markInvoicePaid(invoice.id, invoice.totalCents, {
      paymentIntentId: "pi_test_invoice",
    });

    const stored = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(stored.status).toBe(InvoiceStatus.PAID);
    expect(stored.paidAt).not.toBeNull();
    expect(stored.stripePaymentIntentId).toBe("pi_test_invoice");
  });

  it("keeps a part-paid invoice open with a balance", async () => {
    const { userId, businessId } = await makeBusiness();
    const invoice = await createInvoice(userId, businessId, INVOICE);
    await sendInvoice(userId, businessId, invoice.id);

    await markInvoicePaid(invoice.id, 1_000);

    const stored = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(stored.status).toBe(InvoiceStatus.SENT);
    expect(stored.amountPaidCents).toBe(1_000);
  });

  it("closes once the remaining balance is settled", async () => {
    const { userId, businessId } = await makeBusiness();
    const invoice = await createInvoice(userId, businessId, INVOICE);
    await sendInvoice(userId, businessId, invoice.id);

    await markInvoicePaid(invoice.id, 1_000);
    await markInvoicePaid(invoice.id, invoice.totalCents - 1_000);

    const stored = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(stored.status).toBe(InvoiceStatus.PAID);
  });

  it("never exposes internal identifiers to the customer", async () => {
    const { userId, businessId } = await makeBusiness();
    const invoice = await createInvoice(userId, businessId, INVOICE);
    await sendInvoice(userId, businessId, invoice.id);

    const view = await getPublicInvoice(invoice.reference);
    expect(view).not.toHaveProperty("id");
    expect(view).not.toHaveProperty("customerEmail");
  });
});

describe("listing", () => {
  it("keeps each business's documents to itself", async () => {
    const mine = await makeBusiness();
    const theirs = await makeBusiness();
    await createQuote(theirs.userId, theirs.businessId, QUOTE);
    await createInvoice(theirs.userId, theirs.businessId, INVOICE);

    expect(await listQuotes(mine.userId, mine.businessId)).toHaveLength(0);
    expect(await listInvoices(mine.userId, mine.businessId)).toHaveLength(0);
  });

  it("refuses a non-member entirely", async () => {
    const { businessId } = await makeBusiness();
    const stranger = await makeUser();

    await expect(listQuotes(stranger.id, businessId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("lists invoices newest number first", async () => {
    const { userId, businessId } = await makeBusiness();
    await createInvoice(userId, businessId, INVOICE);
    await createInvoice(userId, businessId, INVOICE);

    const invoices = await listInvoices(userId, businessId);
    expect(invoices.map((invoice) => invoice.number)).toEqual([2, 1]);
  });
});
