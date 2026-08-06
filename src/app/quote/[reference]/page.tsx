import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DocumentSummary } from "@/components/billing/document-lines";
import { QuoteResponse } from "@/components/billing/quote-response";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isBookingReference } from "@/lib/validations/booking";
import { formatPrice } from "@/lib/validations/scheduling";
import { getPublicQuote } from "@/server/billing/quotes";

export const metadata: Metadata = {
  title: "Your quote",
  // The reference is a bearer token for a price and an address.
  robots: { index: false, follow: false },
};

const STATUS = {
  SENT: { label: "Awaiting your answer", variant: "secondary" as const },
  ACCEPTED: { label: "Accepted", variant: "default" as const },
  DECLINED: { label: "Declined", variant: "destructive" as const },
  EXPIRED: { label: "Expired", variant: "outline" as const },
  DRAFT: { label: "Draft", variant: "secondary" as const },
};

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  if (!isBookingReference(reference)) notFound();

  const quote = await getPublicQuote(reference);
  if (!quote) notFound();

  const status = STATUS[quote.status];

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {quote.title}
          </h1>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <p className="text-muted-foreground">
          Quote from {quote.business.name} for {quote.customerName}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What&apos;s included</CardTitle>
          {quote.validUntil ? (
            <CardDescription>
              Valid until {quote.validUntil.toISOString().slice(0, 10)}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <DocumentSummary
            lines={quote.lines}
            subtotalCents={quote.subtotalCents}
            taxCents={quote.taxCents}
            totalCents={quote.totalCents}
          />

          {quote.depositCents > 0 ? (
            <p className="text-muted-foreground text-sm">
              A deposit of {formatPrice(quote.depositCents)} is required to
              schedule the work.
            </p>
          ) : null}

          {quote.notes ? (
            <p className="border-t pt-4 text-sm whitespace-pre-line">
              {quote.notes}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {quote.status === "SENT" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ready to go ahead?</CardTitle>
            <CardDescription>
              Accepting lets {quote.business.name} start the work and send an
              invoice. Nothing is charged now.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QuoteResponse reference={quote.reference} />
          </CardContent>
        </Card>
      ) : null}

      {quote.status === "ACCEPTED" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accepted</CardTitle>
            <CardDescription>
              {quote.invoice
                ? "Your invoice is ready."
                : `${quote.business.name} will be in touch to arrange the work.`}
            </CardDescription>
          </CardHeader>
          {quote.invoice ? (
            <CardContent>
              <Link
                href={`/invoice/${quote.invoice.reference}`}
                className="text-sm underline"
              >
                View invoice
              </Link>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {quote.declineReason ? (
        <p className="text-muted-foreground text-sm">{quote.declineReason}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Questions?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="font-mono text-xs">{quote.reference}</p>
          {quote.business.phone ? (
            <p>
              <a
                href={`tel:${quote.business.phone.replace(/[^\d+]/g, "")}`}
                className="hover:underline"
              >
                {quote.business.phone}
              </a>
            </p>
          ) : null}
          {quote.business.email ? (
            <p>
              <a
                href={`mailto:${quote.business.email}`}
                className="hover:underline"
              >
                {quote.business.email}
              </a>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
