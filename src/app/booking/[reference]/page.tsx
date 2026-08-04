import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, CalendarCheck, Clock, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { siteConfig } from "@/lib/site-config";
import { formatDuration, formatPrice } from "@/lib/validations/scheduling";
import { isBookingReference } from "@/lib/validations/booking";
import { getBookingByReference } from "@/server/businesses/bookings";
import { formatBookingTime } from "@/server/notifications/booking-mail";

export const metadata: Metadata = {
  title: "Your booking",
  // A reference is a bearer token for the booking's details; keep it out of
  // search results.
  robots: { index: false, follow: false },
};

/** What the customer should understand about their money. */
const PAYMENT_COPY: Record<
  "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED",
  (payment: { amountCents: number; refundedCents: number }) => string
> = {
  PENDING: () => "Payment not completed.",
  SUCCEEDED: (payment) => `Paid ${formatPrice(payment.amountCents)}.`,
  FAILED: () => "Payment failed — the business will be in touch.",
  REFUNDED: (payment) =>
    `Refunded ${formatPrice(payment.refundedCents || payment.amountCents)}.`,
};

const STATUS = {
  PENDING: {
    label: "Awaiting confirmation",
    variant: "secondary" as const,
    note: "The business has been notified and will confirm shortly.",
  },
  CONFIRMED: {
    label: "Confirmed",
    variant: "default" as const,
    note: "You're booked in. See you then.",
  },
  DECLINED: {
    label: "Declined",
    variant: "destructive" as const,
    note: "The business couldn't take this one.",
  },
  CANCELLED: {
    label: "Cancelled",
    variant: "destructive" as const,
    note: "This booking was called off.",
  },
  COMPLETED: {
    label: "Completed",
    variant: "default" as const,
    note: "This work is done.",
  },
};

export default async function BookingPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  // Reject malformed references before touching the database, so this cannot
  // be used to probe with arbitrary strings.
  if (!isBookingReference(reference)) notFound();

  const booking = await getBookingByReference(reference);
  if (!booking) notFound();

  const status = STATUS[booking.status];

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Your booking
          </h1>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <p className="text-muted-foreground">{status.note}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{booking.packageName}</CardTitle>
          <CardDescription>
            with{" "}
            <Link
              href={`/pro/${booking.business.slug}`}
              className="hover:text-foreground underline"
            >
              {booking.business.name}
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="flex items-center gap-2">
            <CalendarCheck
              className="text-muted-foreground size-4 shrink-0"
              aria-hidden
            />
            {formatBookingTime(booking)}
          </p>
          <p className="flex items-center gap-2">
            <Clock
              className="text-muted-foreground size-4 shrink-0"
              aria-hidden
            />
            {formatDuration(booking.durationMinutes)} ·{" "}
            {booking.pricingModel === "QUOTE"
              ? "Quoted on site"
              : `${formatPrice(booking.priceCents ?? 0)}${
                  booking.pricingModel === "HOURLY" ? " / hr" : ""
                }`}
          </p>
          <p className="flex items-start gap-2">
            <MapPin
              className="text-muted-foreground mt-0.5 size-4 shrink-0"
              aria-hidden
            />
            <span>
              {booking.addressLine1}
              {booking.addressLine2 ? `, ${booking.addressLine2}` : ""}
              <br />
              {booking.city}, {booking.region} {booking.postalCode}
            </span>
          </p>

          {booking.payment ? (
            <p className="flex items-center gap-2">
              <Banknote
                className="text-muted-foreground size-4 shrink-0"
                aria-hidden
              />
              {PAYMENT_COPY[booking.payment.status](booking.payment)}
            </p>
          ) : null}

          {booking.notes ? (
            <p className="text-muted-foreground border-t pt-3">
              {booking.notes}
            </p>
          ) : null}

          {booking.cancellationReason ? (
            <p className="text-destructive border-t pt-3">
              {booking.cancellationReason}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reference</CardTitle>
          <CardDescription>
            Quote this if you need to get in touch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="font-mono text-lg tracking-widest">
            {booking.reference}
          </p>
          {booking.business.phone ? (
            <p>
              <a
                href={`tel:${booking.business.phone.replace(/[^\d+]/g, "")}`}
                className="hover:underline"
              >
                {booking.business.phone}
              </a>
            </p>
          ) : null}
          {booking.business.email ? (
            <p>
              <a
                href={`mailto:${booking.business.email}`}
                className="hover:underline"
              >
                {booking.business.email}
              </a>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-sm">
        <Link href="/browse" className="hover:underline">
          Browse more pros on {siteConfig.name}
        </Link>
      </p>
    </main>
  );
}
