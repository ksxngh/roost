import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  BookingList,
  type ScheduleBooking,
} from "@/components/schedule/booking-list";
import { BookingStatus } from "@/generated/prisma/enums";
import { currentMembership } from "@/server/businesses/access";
import { listBookings } from "@/server/businesses/bookings";
import { getBusiness } from "@/server/businesses/businesses";
import { formatBookingTime } from "@/server/notifications/booking-mail";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Schedule" };

export default async function SchedulePage() {
  const { user } = await requireSession();
  const membership = await currentMembership(user.id);
  if (!membership) redirect("/onboarding");

  const [business, bookings] = await Promise.all([
    getBusiness(user.id, membership.businessId),
    // Past work drops off automatically; the schedule is about what's next.
    listBookings(user.id, membership.businessId, { from: new Date() }),
  ]);

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
  });

  const pending = bookings
    .filter((booking) => booking.status === BookingStatus.PENDING)
    .map(toView);
  const upcoming = bookings
    .filter((booking) => booking.status === BookingStatus.CONFIRMED)
    .map(toView);

  const hasAny = pending.length > 0 || upcoming.length > 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <PageHeader
        title="Schedule"
        description={`Requests waiting on you, and the work you've committed to. Times in ${business.timezone.replace(/_/g, " ")}.`}
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
      ) : (
        <>
          {pending.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-medium">
                Waiting on you ({pending.length})
              </h2>
              <BookingList bookings={pending} emptyMessage="Nothing waiting." />
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-sm font-medium">Coming up</h2>
            <BookingList
              bookings={upcoming}
              emptyMessage="Nothing confirmed yet."
            />
          </section>
        </>
      )}
    </div>
  );
}
