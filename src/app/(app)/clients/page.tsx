import type { Metadata } from "next";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Clients"
        description="Every customer you've worked with, built automatically from your bookings."
      />
      <EmptyState
        icon={Users}
        title="No clients yet"
        description="Your client list builds itself as bookings come in — history, addresses, and notes included."
      />
    </div>
  );
}
