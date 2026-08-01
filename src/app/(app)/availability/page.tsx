import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BookingSettingsForm } from "@/components/availability/booking-settings-form";
import { ClosuresEditor } from "@/components/availability/closures-editor";
import { HoursEditor } from "@/components/availability/hours-editor";
import { SlotPreview } from "@/components/availability/slot-preview";
import { PageHeader } from "@/components/page-header";
import { dateKeyAt, utcMidnightToDateKey, wallTimeAt } from "@/lib/time";
import { formatMinutes } from "@/lib/time";
import { currentMembership } from "@/server/businesses/access";
import {
  getWeeklyHours,
  listExceptions,
  previewAvailability,
} from "@/server/businesses/availability";
import { getBusiness } from "@/server/businesses/businesses";
import { listPackages } from "@/server/businesses/packages";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Availability" };

const PREVIEW_DAYS = 7;

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ package?: string }>;
}) {
  const { user } = await requireSession();
  const membership = await currentMembership(user.id);
  if (!membership) redirect("/onboarding");

  const { businessId } = membership;
  const [business, hours, packages, { package: requestedPackage }] =
    await Promise.all([
      getBusiness(user.id, businessId),
      getWeeklyHours(user.id, businessId),
      listPackages(user.id, businessId),
      searchParams,
    ]);

  const now = new Date();
  // Past closures are noise once they have happened.
  const closures = await listExceptions(user.id, businessId, {
    from: dateKeyAt(now, business.timezone),
  });

  const bookable = packages.filter((row) => row.active);
  const selected =
    bookable.find((row) => row.id === requestedPackage) ?? bookable.at(0);

  const days = selected
    ? await previewAvailability(user.id, businessId, selected.id, {
        days: PREVIEW_DAYS,
        now,
      })
    : [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Availability"
        description="When you work, when you don't, and how much notice you need."
      />

      <BookingSettingsForm
        settings={{
          timezone: business.timezone,
          bookingLeadHours: business.bookingLeadHours,
          bookingHorizonDays: business.bookingHorizonDays,
        }}
      />

      <HoursEditor
        hours={hours.map((hour) => ({
          weekday: hour.weekday,
          startMinute: hour.startMinute,
          endMinute: hour.endMinute,
        }))}
      />

      <ClosuresEditor
        closures={closures.map((closure) => ({
          id: closure.id,
          date: utcMidnightToDateKey(closure.date),
          note: closure.note,
        }))}
      />

      <SlotPreview
        timezone={business.timezone}
        selectedPackageId={selected?.id ?? null}
        packages={bookable.map((row) => ({ id: row.id, name: row.name }))}
        totalSlots={days.reduce((sum, day) => sum + day.slots.length, 0)}
        days={days.map((day) => ({
          date: day.date,
          weekday: day.weekday,
          // Formatted server-side so the provider sees their own timezone,
          // not the timezone of whatever device they happen to be on.
          times: day.slots.map((slot) =>
            formatMinutes(wallTimeAt(slot, business.timezone).minutes),
          ),
        }))}
      />
    </div>
  );
}
