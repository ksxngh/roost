import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocumentSummary } from "@/components/billing/document-lines";
import { PayInvoice } from "@/components/billing/pay-invoice";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { balanceCents } from "@/lib/money";
import { isBookingReference } from "@/lib/validations/booking";
import { getPublicInvoice } from "@/server/billing/invoices";
import { paymentsConfigured } from "@/server/payments/stripe";

export const metadata: Metadata = {
  title: "Your invoice",
  robots: { index: false, follow: false },
};

const STATUS = {
  SENT: { label: "Awaiting payment", variant: "secondary" as const },
  PAID: { label: "Paid", variant: "default" as const },
  VOID: { label: "Void", variant: "destructive" as const },
  DRAFT: { label: "Draft", variant: "secondary" as const },
};

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  if (!isBookingReference(reference)) notFound();

  const invoice = await getPublicInvoice(reference);
  if (!invoice) notFound();

  const status = STATUS[invoice.status];
  const outstanding = balanceCents(invoice.totalCents, invoice.amountPaidCents);
  const payable =
    invoice.status === "SENT" &&
    outstanding > 0 &&
    paymentsConfigured() &&
    invoice.business.stripeChargesEnabled;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Invoice #{invoice.number}
          </h1>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <p className="text-muted-foreground">
          {invoice.title} · from {invoice.business.name}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Charges</CardTitle>
          {invoice.dueAt ? (
            <CardDescription>
              Due {invoice.dueAt.toISOString().slice(0, 10)}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <DocumentSummary
            lines={invoice.lines}
            subtotalCents={invoice.subtotalCents}
            taxCents={invoice.taxCents}
            totalCents={invoice.totalCents}
            amountPaidCents={invoice.amountPaidCents}
          />

          {invoice.notes ? (
            <p className="border-t pt-4 text-sm whitespace-pre-line">
              {invoice.notes}
            </p>
          ) : null}

          {payable ? (
            <div className="border-t pt-4">
              <PayInvoice
                reference={invoice.reference}
                amountCents={outstanding}
              />
            </div>
          ) : invoice.status === "SENT" ? (
            <p className="text-muted-foreground border-t pt-4 text-sm">
              {invoice.business.name} will arrange payment with you directly.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Questions?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="font-mono text-xs">{invoice.reference}</p>
          {invoice.business.phone ? (
            <p>
              <a
                href={`tel:${invoice.business.phone.replace(/[^\d+]/g, "")}`}
                className="hover:underline"
              >
                {invoice.business.phone}
              </a>
            </p>
          ) : null}
          {invoice.business.email ? (
            <p>
              <a
                href={`mailto:${invoice.business.email}`}
                className="hover:underline"
              >
                {invoice.business.email}
              </a>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
