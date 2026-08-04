"use client";

import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WEEKDAY_NAMES } from "@/lib/time";
import { cn } from "@/lib/utils";

export type CalendarEntry = {
  id: string;
  /** `YYYY-MM-DD` in the business's timezone. */
  date: string;
  weekday: number;
  /** Minutes from midnight, business-local, for positioning. */
  startMinute: number;
  endMinute: number;
  label: string;
  customerName: string;
  timeLabel: string;
  status: "PENDING" | "CONFIRMED" | "DECLINED" | "CANCELLED" | "COMPLETED";
  assignedTo: string | null;
};

export type CalendarDay = { date: string; weekday: number; label: string };

const STATUS_STYLE = {
  PENDING:
    "bg-secondary text-secondary-foreground border-l-2 border-l-amber-500",
  CONFIRMED: "bg-primary/10 text-foreground border-l-2 border-l-primary",
  COMPLETED:
    "bg-muted text-muted-foreground border-l-2 border-l-muted-foreground/40",
  DECLINED: "hidden",
  CANCELLED: "hidden",
} as const;

/**
 * A week at a glance.
 *
 * Deliberately not an hour grid: home-services days are sparse, and a grid
 * spends most of its pixels on empty 3am rows. Jobs are listed per day in
 * time order, which is what a provider actually scans for.
 */
export function WeekCalendar({
  days,
  entries,
  today,
}: {
  days: CalendarDay[];
  entries: CalendarEntry[];
  /** `YYYY-MM-DD` in the business's timezone. */
  today: string;
}) {
  const byDate = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    if (entry.status === "DECLINED" || entry.status === "CANCELLED") continue;
    const list = byDate.get(entry.date) ?? [];
    list.push(entry);
    byDate.set(entry.date, list);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => a.startMinute - b.startMinute);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {days.map((day) => {
        const dayEntries = byDate.get(day.date) ?? [];
        const isToday = day.date === today;
        return (
          <Card key={day.date} className={cn(isToday && "border-primary/50")}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {WEEKDAY_NAMES[day.weekday]}
                {isToday ? (
                  <span className="text-primary ml-2 text-xs font-normal">
                    Today
                  </span>
                ) : null}
              </CardTitle>
              <CardDescription className="text-xs">{day.label}</CardDescription>
            </CardHeader>
            <CardContent>
              {dayEntries.length === 0 ? (
                <p className="text-muted-foreground text-xs">Nothing booked</p>
              ) : (
                <ul className="space-y-1.5">
                  {dayEntries.map((entry) => (
                    <li key={entry.id}>
                      <div
                        className={cn(
                          "rounded-md px-2 py-1.5 text-xs",
                          STATUS_STYLE[entry.status],
                        )}
                      >
                        <p className="font-medium">{entry.timeLabel}</p>
                        <p className="truncate">{entry.label}</p>
                        <p className="truncate opacity-80">
                          {entry.customerName}
                          {entry.assignedTo ? ` · ${entry.assignedTo}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
      <p className="text-muted-foreground col-span-full text-xs">
        Declined and cancelled work is hidden here.{" "}
        <Link href="/schedule?view=list" className="hover:underline">
          See the full list
        </Link>
        .
      </p>
    </div>
  );
}
