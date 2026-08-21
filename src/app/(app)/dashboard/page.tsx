import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarClock,
  CircleDollarSign,
  FileText,
  Users,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatPrice } from "@/lib/validations/scheduling";
import { currentMembership } from "@/server/businesses/access";
import { getDashboardStats } from "@/server/businesses/dashboard";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The provider's home screen. Ordered the way a service business actually
 * checks in: what's on today, what needs a reply, what's owed, who they serve.
 */
export default async function DashboardPage() {
  const { user } = await requireSession();
  const membership = await currentMembership(user.id);
  if (!membership) redirect("/onboarding");

  const stats = await getDashboardStats(user.id, membership.businessId);
  const firstName = user.name.split(/\s+/)[0];

  const cards: {
    label: string;
    value: string;
    hint: string;
    icon: LucideIcon;
    href: string;
  }[] = [
    {
      label: "Jobs today",
      value: String(stats.jobsToday),
      hint: "confirmed for today",
      icon: CalendarClock,
      href: "/schedule",
    },
    {
      label: "Open quotes",
      value: String(stats.openQuotes),
      hint: "awaiting a reply",
      icon: FileText,
      href: "/quotes",
    },
    {
      label: "Unpaid invoices",
      value: formatPrice(stats.unpaidCents),
      hint:
        stats.unpaidInvoices === 1
          ? "1 invoice outstanding"
          : `${stats.unpaidInvoices} invoices outstanding`,
      icon: CircleDollarSign,
      href: "/invoices",
    },
    {
      label: "Clients",
      value: String(stats.clients),
      hint: "total",
      icon: Users,
      href: "/clients",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Today at a glance — what's booked, what needs action, and what you're owed."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="focus-visible:ring-ring rounded-xl focus-visible:ring-2 focus-visible:outline-none"
          >
            <Card className="hover:border-foreground/20 h-full transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {card.label}
                </CardTitle>
                <card.icon
                  className="text-muted-foreground size-4"
                  aria-hidden
                />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{card.value}</p>
                <CardDescription>{card.hint}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
