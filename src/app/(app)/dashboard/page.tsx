import type { Metadata } from "next";
import { Flame, Clock3, Target, TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard" };

const stats = [
  { label: "Study streak", value: "—", hint: "days in a row", icon: Flame },
  { label: "Study time", value: "—", hint: "this week", icon: Clock3 },
  { label: "Cards due", value: "—", hint: "for review today", icon: Target },
  { label: "Retention", value: "—", hint: "30-day average", icon: TrendingUp },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Dashboard"
        description="Your studying at a glance — streaks, reviews due, and where to focus next."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.label}
              </CardTitle>
              <stat.icon
                className="text-muted-foreground size-4"
                aria-hidden="true"
              />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{stat.value}</p>
              <CardDescription>{stat.hint}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-muted-foreground mt-8 text-sm">
        Statistics activate once you upload material and start reviewing —
        coming online in the next milestones.
      </p>
    </div>
  );
}
