import { siteConfig } from "@/lib/site-config";
import { formatQuantity } from "@/lib/money";
import { formatPrice } from "@/lib/validations/scheduling";
import { type Mailer, createMailer } from "@/server/mailer";
import { prisma } from "@/server/db";

type Line = {
  description: string;
  quantityHundredths: number;
  unitPriceCents: number;
};

/** The document body both sides read, rendered the same way every time. */
function renderLines(lines: readonly Line[]): string {
  return lines
    .map(
      (line) =>
        `  ${formatQuantity(line.quantityHundredths)} × ${line.description} — ${formatPrice(line.unitPriceCents)}`,
    )
    .join("\n");
}

function renderTotals(document: {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}): string {
  const rows = [`Subtotal: ${formatPrice(document.subtotalCents)}`];
  if (document.taxCents > 0) {
    rows.push(`Tax:      ${formatPrice(document.taxCents)}`);
  }
  rows.push(`Total:    ${formatPrice(document.totalCents)}`);
  return rows.join("\n");
}

/** Tell the customer a quote is waiting for them. */
export async function sendQuoteSent(
  quoteId: string,
  deps: { mailer?: Mailer } = {},
): Promise<void> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      lines: { orderBy: { position: "asc" } },
      business: { select: { name: true, phone: true } },
    },
  });
  if (!quote) return;

  await (deps.mailer ?? createMailer()).send({
    to: quote.customerEmail,
    subject: `Quote from ${quote.business.name}: ${quote.title}`,
    text: [
      `Hi ${quote.customerName},`,
      "",
      `${quote.business.name} has sent you a quote.`,
      "",
      quote.title,
      renderLines(quote.lines),
      "",
      renderTotals(quote),
      ...(quote.depositCents > 0
        ? ["", `Deposit to book: ${formatPrice(quote.depositCents)}`]
        : []),
      ...(quote.validUntil
        ? ["", `Valid until ${quote.validUntil.toISOString().slice(0, 10)}`]
        : []),
      ...(quote.notes ? ["", quote.notes] : []),
      "",
      "Accept or decline:",
      `${siteConfig.url}/quote/${quote.reference}`,
      ...(quote.business.phone
        ? ["", `Questions? Call ${quote.business.phone}.`]
        : []),
    ].join("\n"),
  });
}

/** Tell the business what the customer decided. */
export async function sendQuoteAnswered(
  quoteId: string,
  deps: { mailer?: Mailer } = {},
): Promise<void> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { business: { select: { name: true, email: true } } },
  });
  if (!quote?.business.email) return;

  const accepted = quote.status === "ACCEPTED";
  await (deps.mailer ?? createMailer()).send({
    to: quote.business.email,
    subject: `${accepted ? "Accepted" : "Declined"}: ${quote.title}`,
    text: [
      `${quote.customerName} ${accepted ? "accepted" : "declined"} your quote.`,
      "",
      `${quote.title} — ${formatPrice(quote.totalCents)}`,
      `Reference: ${quote.reference}`,
      ...(quote.declineReason ? ["", `Reason: ${quote.declineReason}`] : []),
      "",
      accepted
        ? `Raise the invoice: ${siteConfig.url}/quotes`
        : `${siteConfig.url}/quotes`,
    ].join("\n"),
  });
}

/** Send the customer an invoice they can pay. */
export async function sendInvoiceIssued(
  invoiceId: string,
  deps: { mailer?: Mailer } = {},
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lines: { orderBy: { position: "asc" } },
      business: { select: { name: true, phone: true } },
    },
  });
  if (!invoice) return;

  await (deps.mailer ?? createMailer()).send({
    to: invoice.customerEmail,
    subject: `Invoice #${invoice.number} from ${invoice.business.name}`,
    text: [
      `Hi ${invoice.customerName},`,
      "",
      `Invoice #${invoice.number} — ${invoice.title}`,
      "",
      renderLines(invoice.lines),
      "",
      renderTotals(invoice),
      ...(invoice.dueAt
        ? ["", `Due ${invoice.dueAt.toISOString().slice(0, 10)}`]
        : []),
      ...(invoice.notes ? ["", invoice.notes] : []),
      "",
      "View and pay:",
      `${siteConfig.url}/invoice/${invoice.reference}`,
      ...(invoice.business.phone
        ? ["", `Questions? Call ${invoice.business.phone}.`]
        : []),
    ].join("\n"),
  });
}
