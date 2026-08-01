import type { Metadata } from "next";
import { Receipt } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Invoices"
        description="What you've billed, what's been paid, and what's still outstanding."
      />
      <EmptyState
        icon={Receipt}
        title="No invoices yet"
        description="Completed jobs generate invoices here, with payouts tracked to your bank."
      />
    </div>
  );
}
