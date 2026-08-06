import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  InvoiceList,
  type InvoiceRow,
} from "@/components/billing/invoice-list";
import { PageHeader } from "@/components/page-header";
import { listInvoices } from "@/server/billing/invoices";
import { currentMembership } from "@/server/businesses/access";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const { user } = await requireSession();
  const membership = await currentMembership(user.id);
  if (!membership) redirect("/onboarding");

  const invoices = await listInvoices(user.id, membership.businessId);

  const rows: InvoiceRow[] = invoices.map((invoice) => ({
    id: invoice.id,
    reference: invoice.reference,
    number: invoice.number,
    title: invoice.title,
    customerName: invoice.customerName,
    totalCents: invoice.totalCents,
    amountPaidCents: invoice.amountPaidCents,
    status: invoice.status,
    dueAt: invoice.dueAt?.toISOString().slice(0, 10) ?? null,
  }));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Invoices"
        description="What you've billed, and what's still outstanding."
      />
      <InvoiceList invoices={rows} />
    </div>
  );
}
