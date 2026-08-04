"use client";

import { Check, Clock, MapPin, Phone, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AssignPicker,
  type AssignableMember,
} from "@/components/schedule/assign-picker";
import { formatDuration, formatPrice } from "@/lib/validations/scheduling";
import {
  cancelBookingAction,
  completeBookingAction,
  confirmBookingAction,
  declineBookingAction,
} from "@/server/businesses/booking-actions";

export type ScheduleBooking = {
  id: string;
  reference: string;
  packageName: string;
  pricingModel: "FIXED" | "HOURLY" | "QUOTE";
  priceCents: number | null;
  durationMinutes: number;
  /** Pre-formatted server-side in the business's timezone. */
  when: string;
  status: "PENDING" | "CONFIRMED" | "DECLINED" | "CANCELLED" | "COMPLETED";
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  address: string;
  notes: string | null;
  /** Null when the booking was never taken online. */
  payment: {
    status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
    amountCents: number;
    refundedCents: number;
  } | null;
  assignedToId: string | null;
  internalNote: string | null;
};

/** What the *provider* needs to know about the money. */
const PAYMENT_COPY = {
  PENDING: (p: { amountCents: number }) =>
    `${formatPrice(p.amountCents)} not yet paid`,
  SUCCEEDED: (p: { amountCents: number }) =>
    `${formatPrice(p.amountCents)} paid`,
  FAILED: () => "Payment failed",
  REFUNDED: (p: { amountCents: number; refundedCents: number }) =>
    `${formatPrice(p.refundedCents || p.amountCents)} refunded`,
} as const;

const PAYMENT_VARIANT = {
  PENDING: "secondary",
  SUCCEEDED: "outline",
  FAILED: "destructive",
  REFUNDED: "outline",
} as const;

const STATUS_LABEL = {
  PENDING: "Needs a reply",
  CONFIRMED: "Confirmed",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
} as const;

const STATUS_VARIANT = {
  PENDING: "secondary",
  CONFIRMED: "default",
  DECLINED: "destructive",
  CANCELLED: "destructive",
  COMPLETED: "outline",
} as const;

export function BookingList({
  bookings,
  emptyMessage,
  members = [],
}: {
  bookings: ScheduleBooking[];
  emptyMessage: string;
  /** Seats that can be given work; empty on a solo business. */
  members?: AssignableMember[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(
    booking: ScheduleBooking,
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    setBusyId(booking.id);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  if (bookings.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-3">
      {bookings.map((booking) => (
        <li key={booking.id}>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {booking.packageName}
                <Badge variant={STATUS_VARIANT[booking.status]}>
                  {STATUS_LABEL[booking.status]}
                </Badge>
              </CardTitle>
              <CardDescription>{booking.when}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground flex items-center gap-2">
                <Clock className="size-3.5 shrink-0" aria-hidden />
                {formatDuration(booking.durationMinutes)} ·{" "}
                {booking.pricingModel === "QUOTE"
                  ? "Quote on site"
                  : `${formatPrice(booking.priceCents ?? 0)}${
                      booking.pricingModel === "HOURLY" ? " / hr" : ""
                    }`}
              </p>

              <div className="space-y-1">
                <p className="font-medium">{booking.customerName}</p>
                <p className="text-muted-foreground flex items-center gap-2">
                  <Phone className="size-3.5 shrink-0" aria-hidden />
                  <a
                    href={`tel:${booking.customerPhone.replace(/[^\d+]/g, "")}`}
                    className="hover:underline"
                  >
                    {booking.customerPhone}
                  </a>
                </p>
                <p className="text-muted-foreground flex items-start gap-2">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {booking.address}
                </p>
              </div>

              {booking.notes ? (
                <p className="bg-muted rounded-md px-3 py-2">{booking.notes}</p>
              ) : null}

              {booking.internalNote ? (
                <p className="bg-muted/50 text-muted-foreground rounded-md px-3 py-2 text-xs">
                  Internal: {booking.internalNote}
                </p>
              ) : null}

              {booking.status === "PENDING" ||
              booking.status === "CONFIRMED" ? (
                <AssignPicker
                  bookingId={booking.id}
                  members={members}
                  assignedToId={booking.assignedToId}
                />
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <p className="text-muted-foreground font-mono text-xs">
                  {booking.reference}
                </p>
                {booking.payment ? (
                  <Badge variant={PAYMENT_VARIANT[booking.payment.status]}>
                    {PAYMENT_COPY[booking.payment.status](booking.payment)}
                  </Badge>
                ) : null}
              </div>

              {booking.status === "PENDING" ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busyId === booking.id}
                    onClick={() =>
                      run(
                        booking,
                        () => confirmBookingAction(booking.id),
                        "Booking confirmed.",
                      )
                    }
                  >
                    <Check className="size-4" aria-hidden />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === booking.id}
                    onClick={() =>
                      run(
                        booking,
                        () => declineBookingAction(booking.id),
                        "Booking declined.",
                      )
                    }
                  >
                    <X className="size-4" aria-hidden />
                    Decline
                  </Button>
                </div>
              ) : null}

              {booking.status === "CONFIRMED" ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busyId === booking.id}
                    onClick={() =>
                      run(
                        booking,
                        () => completeBookingAction(booking.id),
                        "Marked complete.",
                      )
                    }
                  >
                    Mark complete
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === booking.id}
                    onClick={() =>
                      run(
                        booking,
                        () => cancelBookingAction(booking.id),
                        "Booking cancelled.",
                      )
                    }
                  >
                    Cancel
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
