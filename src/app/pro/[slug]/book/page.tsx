import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { BookingFlow } from "@/components/booking/booking-flow";
import { formatMinutes, wallTimeAt } from "@/lib/time";
import { isChargeable } from "@/lib/validations/payment";
import { publicAvailability } from "@/server/businesses/availability";
import { getPublicStorefront } from "@/server/businesses/public";
import { paymentsConfigured } from "@/server/payments/stripe";

export const metadata: Metadata = { title: "Book" };

/** How far ahead the picker offers, before the business's own horizon caps it. */
const BOOKING_DAYS = 21;

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ service?: string }>;
}) {
  const [{ slug }, { service: requestedService }] = await Promise.all([
    params,
    searchParams,
  ]);

  const business = await getPublicStorefront(slug);
  if (!business) notFound();

  // Default to the first published service so a bare /book URL still works.
  const service =
    business.packages.find((row) => row.id === requestedService) ??
    business.packages.at(0);
  if (!service) notFound();

  const days =
    (await publicAvailability(slug, service.id, { days: BOOKING_DAYS })) ?? [];

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <Link
        href={`/pro/${slug}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        {business.name}
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">Book a time</h1>

      <BookingFlow
        slug={slug}
        businessName={business.name}
        timezone={business.timezone}
        payable={
          paymentsConfigured() &&
          isChargeable({
            pricingModel: service.pricingModel,
            priceCents: service.priceCents,
            chargesEnabled: business.stripeChargesEnabled,
          })
        }
        service={{
          id: service.id,
          name: service.name,
          description: service.description,
          pricingModel: service.pricingModel,
          priceCents: service.priceCents,
          durationMinutes: service.durationMinutes,
        }}
        days={days.map((day) => ({
          date: day.date,
          weekday: day.weekday,
          // Labelled server-side in the business's zone, so a customer in
          // another timezone still reads the provider's working hours.
          slots: day.slots.map((slot) => ({
            iso: slot.toISOString(),
            label: formatMinutes(wallTimeAt(slot, business.timezone).minutes),
          })),
        }))}
      />
    </main>
  );
}
