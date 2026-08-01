import type { Metadata } from "next";
import { CalendarClock, CircleDollarSign, FileText, Users } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The provider's home screen. Ordered the way a service business actually
 * checks in: what's on today, what needs a reply, what's owed.
 */
const stats = [
  { label: "Jobs today", value: "—", hint: "scheduled", icon: CalendarClock },
  {
    label: "Open quotes",
    value: "—",
    hint: "awaiting approval",
    icon: FileText,
  },
  {
    label: "Unpaid invoices",
    value: "—",
    hint: "outstanding",
    icon: CircleDollarSign,
  },
  { label: "Clients", value: "—", hint: "total", icon: Users },
];

export default async function DashboardPage() {
  const { user } = await requireSession();
  const firstName = user.name.split(/\s+/)[0];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Today at a glance — what's booked, what needs action, and what you're owed."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.label}
              </CardTitle>
              <stat.icon className="text-muted-foreground size-4" aria-hidden />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{stat.value}</p>
              <CardDescription>{stat.hint}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-muted-foreground mt-8 text-sm">
        These fill in once your storefront is live and bookings start arriving.
      </p>
    </div>
  );
}
