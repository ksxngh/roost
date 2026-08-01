import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Quotes" };

export default function QuotesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Quotes"
        description="Estimates you've sent, and the ones waiting on a customer's approval."
      />
      <EmptyState
        icon={FileText}
        title="No quotes yet"
        description="Send an estimate and it turns into a scheduled job the moment the customer approves it."
      />
    </div>
  );
}
