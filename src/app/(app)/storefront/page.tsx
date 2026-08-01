import type { Metadata } from "next";
import { Store } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Storefront" };

export default function StorefrontPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Storefront"
        description="How your business appears to customers browsing the marketplace."
      />
      <EmptyState
        icon={Store}
        title="Storefront not set up"
        description="Add your services, coverage area, and hours to go live on the marketplace."
      />
    </div>
  );
}
