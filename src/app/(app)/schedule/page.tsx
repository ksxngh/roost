import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  BookingList,
  type ScheduleBooking,
} from "@/components/schedule/booking-list";
import {
  WeekCalendar,
  type CalendarDay,
  type CalendarEntry,
} from "@/components/schedule/week-calendar";
import { BookingStatus } from "@/generated/prisma/enums";
import {
  addDays,
  dateKeyAt,
  formatMinutes,
  wallTimeAt,
  weekdayOf,
} from "@/lib/time";
import { cn } from "@/lib/utils";
import { currentMembership } from "@/server/businesses/access";
import {
  listAssignableMembers,
  listBookings,
} from "@/server/businesses/bookings";
import { getBusiness } from "@/server/businesses/businesses";
import { formatBookingTime } from "@/server/notifications/booking-mail";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Schedule" };

/** How much of the week ahead the calendar shows. */
const CALENDAR_DAYS = 8;

const VIEWS = [
  { key: "calendar", label: "Week" },
  { key: "today", label: "Today" },
  { key: "list", label: "List" },
] as const;

type View = (typeof VIEWS)[number]["key"];

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { user } = await requireSession();
  const membership = await currentMembership(user.id);
  if (!membership) redirect("/onboarding");

  const { businessId } = membership;
  const now = new Date();

  const [business, bookings, members, { view: requestedView }] =
    await Promise.all([
      getBusiness(user.id, businessId),
      // Past work drops off automatically; the schedule is about what's next.
      listBookings(user.id, businessId, { from: now }),
      listAssignableMembers(user.id, businessId),
      searchParams,
    ]);

  const view: View =
    VIEWS.find((entry) => entry.key === requestedView)?.key ?? "calendar";

  const { timezone } = business;
  const today = dateKeyAt(now, timezone);

  const memberNames = new Map(
    members.map((member) => [member.id, member.user.name]),
  );

  const toView = (booking: (typeof bookings)[number]): ScheduleBooking => ({
    id: booking.id,
    reference: booking.reference,
    packageName: booking.packageName,
    pricingModel: booking.pricingModel,
    priceCents: booking.priceCents,
    durationMinutes: booking.durationMinutes,
    // Formatted here so every viewer reads the business's timezone, not their
    // own device's.
    when: formatBookingTime(booking),
    status: booking.status,
    customerName: booking.customerName,
    customerPhone: booking.customerPhone,
    customerEmail: booking.customerEmail,
    address: [
      booking.addressLine1,
      booking.addressLine2,
      `${booking.city}, ${booking.region} ${booking.postalCode}`,
    ]
      .filter(Boolean)
      .join(", "),
    notes: booking.notes,
    payment: booking.payment
      ? {
          status: booking.payment.status,
          amountCents: booking.payment.amountCents,
          refundedCents: booking.payment.refundedCents,
        }
      : null,
    assignedToId: booking.assignedToId,
    internalNote: booking.internalNote,
  });

  const assignable = members.map((member) => ({
    id: member.id,
    name: member.user.name,
  }));

  const pending = bookings
    .filter((booking) => booking.status === BookingStatus.PENDING)
    .map(toView);
  const upcoming = bookings
    .filter((booking) => booking.status === BookingStatus.CONFIRMED)
    .map(toView);

  const hasAny = pending.length > 0 || upcoming.length > 0;

  const calendarDays: CalendarDay[] = Array.from(
    { length: CALENDAR_DAYS },
    (_, offset) => {
      const date = addDays(today, offset);
      return { date, weekday: weekdayOf(date), label: date };
    },
  );

  const entries: CalendarEntry[] = bookings.map((booking) => {
    const start = wallTimeAt(booking.startAt, timezone);
    const end = wallTimeAt(booking.endAt, timezone);
    return {
      id: booking.id,
      date: dateKeyAt(booking.startAt, timezone),
      weekday: weekdayOf(dateKeyAt(booking.startAt, timezone)),
      startMinute: start.minutes,
      endMinute: end.minutes,
      label: booking.packageName,
      customerName: booking.customerName,
      timeLabel: formatMinutes(start.minutes),
      status: booking.status,
      assignedTo: booking.assignedToId
        ? (memberNames.get(booking.assignedToId) ?? null)
        : null,
    };
  });

  // The day sheet is the run order for the driveway, so declined and
  // cancelled work has no business appearing on it.
  const todaysWork = bookings
    .filter(
      (booking) =>
        dateKeyAt(booking.startAt, timezone) === today &&
        (booking.status === BookingStatus.CONFIRMED ||
          booking.status === BookingStatus.PENDING),
    )
    .map(toView);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="Schedule"
        description={`Requests waiting on you, and the work you've committed to. Times in ${timezone.replace(/_/g, " ")}.`}
        actions={
          <nav className="flex gap-1" aria-label="Schedule view">
            {VIEWS.map((entry) => (
              <Link
                key={entry.key}
                href={`/schedule?view=${entry.key}`}
                aria-current={view === entry.key ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 text-sm transition-colors",
                  view === entry.key
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {entry.label}
              </Link>
            ))}
          </nav>
        }
      />

      {!hasAny ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing scheduled yet"
          description={
            business.status === "ACTIVE"
              ? "Booking requests from the marketplace will land here."
              : "Once your storefront is live, booking requests land here automatically."
          }
        />
      ) : view === "calendar" ? (
        <WeekCalendar days={calendarDays} entries={entries} today={today} />
      ) : view === "today" ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">
            Today&apos;s run ({todaysWork.length})
          </h2>
          <BookingList
            bookings={todaysWork}
            members={assignable}
            emptyMessage="Nothing on today."
          />
        </section>
      ) : (
        <>
          {pending.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-medium">
                Waiting on you ({pending.length})
              </h2>
              <BookingList
                bookings={pending}
                members={assignable}
                emptyMessage="Nothing waiting."
              />
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-sm font-medium">Coming up</h2>
            <BookingList
              bookings={upcoming}
              members={assignable}
              emptyMessage="Nothing confirmed yet."
            />
          </section>
        </>
      )}
    </div>
  );
}
