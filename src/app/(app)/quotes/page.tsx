import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { QuoteEditor } from "@/components/billing/quote-editor";
import { QuoteList, type QuoteRow } from "@/components/billing/quote-list";
import { listQuotes } from "@/server/billing/quotes";
import { currentMembership } from "@/server/businesses/access";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Quotes" };

export default async function QuotesPage() {
  const { user } = await requireSession();
  const membership = await currentMembership(user.id);
  if (!membership) redirect("/onboarding");

  const quotes = await listQuotes(user.id, membership.businessId);

  const rows: QuoteRow[] = quotes.map((quote) => ({
    id: quote.id,
    reference: quote.reference,
    title: quote.title,
    customerName: quote.customerName,
    totalCents: quote.totalCents,
    status: quote.status,
    declineReason: quote.declineReason,
    invoiceReference: quote.invoice?.reference ?? null,
  }));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Quotes"
        description="Estimates you've sent, and what customers said."
      />
      <QuoteEditor />
      <QuoteList quotes={rows} />
    </div>
  );
}
