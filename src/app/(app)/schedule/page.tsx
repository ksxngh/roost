import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Schedule" };

export default function SchedulePage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Schedule"
        description="Your calendar — today's jobs, upcoming work, and open slots customers can book."
      />
      <EmptyState
        icon={CalendarDays}
        title="Nothing scheduled yet"
        description="Once your storefront is live, confirmed bookings land here automatically."
      />
    </div>
  );
}
