"use client";

import { ArrowLeft, Clock, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WEEKDAY_NAMES } from "@/lib/time";
import { formatDuration, formatPrice } from "@/lib/validations/scheduling";
import { createBookingAction } from "@/server/businesses/booking-actions";

export type BookableDay = {
  date: string;
  weekday: number;
  /** `{ iso, label }` — the label is pre-formatted in the business's zone. */
  slots: { iso: string; label: string }[];
};

export type BookableService = {
  id: string;
  name: string;
  description: string | null;
  pricingModel: "FIXED" | "HOURLY" | "QUOTE";
  priceCents: number | null;
  durationMinutes: number;
};

function priceLabel(service: BookableService): string {
  if (service.pricingModel === "QUOTE") return "Quoted on site";
  const price = formatPrice(service.priceCents ?? 0);
  return service.pricingModel === "HOURLY" ? `${price} / hr` : price;
}

const BLANK_DETAILS = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  postalCode: "",
  notes: "",
};

/**
 * Two steps: pick a time, then say where and who.
 *
 * The slot list comes from the server and is never recomputed here — the
 * client has no business deciding what is bookable, and a slot can be taken
 * between render and submit, which the server reports back as an error.
 */
export function BookingFlow({
  slug,
  businessName,
  timezone,
  service,
  days,
}: {
  slug: string;
  businessName: string;
  timezone: string;
  service: BookableService;
  days: BookableDay[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<{
    iso: string;
    label: string;
    date: string;
  } | null>(null);
  const [details, setDetails] = useState(BLANK_DETAILS);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const bookable = days.filter((day) => day.slots.length > 0);

  function field(key: keyof typeof BLANK_DETAILS) {
    return {
      value: details[key],
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => setDetails((current) => ({ ...current, [key]: event.target.value })),
    };
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError(null);

    startTransition(async () => {
      const result = await createBookingAction(slug, {
        packageId: service.id,
        startAt: selected.iso,
        customerName: details.customerName.trim(),
        customerEmail: details.customerEmail.trim(),
        customerPhone: details.customerPhone.trim(),
        addressLine1: details.addressLine1.trim(),
        addressLine2: details.addressLine2.trim() || null,
        city: details.city.trim(),
        region: details.region.trim(),
        postalCode: details.postalCode.trim(),
        notes: details.notes.trim() || null,
      });

      if (result.ok) {
        router.push(`/booking/${result.data.reference}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{service.name}</CardTitle>
          <CardDescription>
            {businessName} · {priceLabel(service)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {service.description ? (
            <p className="text-sm">{service.description}</p>
          ) : null}
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <Clock className="size-3.5" aria-hidden />
            {formatDuration(service.durationMinutes)}
          </p>
        </CardContent>
      </Card>

      {selected === null ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pick a time</CardTitle>
            <CardDescription>
              Times are in {timezone.replace(/_/g, " ")}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bookable.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No times available right now. Try again later, or contact the
                business directly.
              </p>
            ) : (
              <ul className="space-y-4">
                {bookable.map((day) => (
                  <li key={day.date}>
                    <p className="text-sm font-medium">
                      {WEEKDAY_NAMES[day.weekday]}{" "}
                      <span className="text-muted-foreground font-normal">
                        {day.date}
                      </span>
                    </p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {day.slots.map((slot) => (
                        <li key={slot.iso}>
                          <button
                            type="button"
                            onClick={() =>
                              setSelected({ ...slot, date: day.date })
                            }
                            className="hover:bg-accent focus-visible:ring-ring rounded-md border px-2.5 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                          >
                            {slot.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your details</CardTitle>
              <CardDescription>
                {selected.date} at {selected.label} ·{" "}
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="hover:text-foreground underline"
                >
                  change time
                </button>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="booking-name">Your name</Label>
                  <Input
                    id="booking-name"
                    autoComplete="name"
                    maxLength={120}
                    {...field("customerName")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="booking-phone">Phone</Label>
                  <Input
                    id="booking-phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={32}
                    {...field("customerPhone")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="booking-email">Email</Label>
                <Input
                  id="booking-email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  {...field("customerEmail")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="booking-address">Street address</Label>
                <Input
                  id="booking-address"
                  autoComplete="address-line1"
                  maxLength={160}
                  {...field("addressLine1")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="booking-address2">
                  Unit or buzzer (optional)
                </Label>
                <Input
                  id="booking-address2"
                  autoComplete="address-line2"
                  maxLength={160}
                  {...field("addressLine2")}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="booking-city">City</Label>
                  <Input
                    id="booking-city"
                    autoComplete="address-level2"
                    maxLength={80}
                    {...field("city")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="booking-region">Province</Label>
                  <Input
                    id="booking-region"
                    autoComplete="address-level1"
                    maxLength={3}
                    {...field("region")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="booking-postal">Postal code</Label>
                  <Input
                    id="booking-postal"
                    autoComplete="postal-code"
                    maxLength={12}
                    {...field("postalCode")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="booking-notes">
                  Anything they should know? (optional)
                </Label>
                <Textarea
                  id="booking-notes"
                  rows={3}
                  maxLength={1000}
                  placeholder="Gate code, parking, which sink…"
                  {...field("notes")}
                />
              </div>

              {error ? (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={pending}>
                  {pending ? "Requesting…" : "Request booking"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setSelected(null)}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Back
                </Button>
              </div>
              <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Your address is shared with {businessName} so they can find you.
                Nothing is charged now — payment arrives with the confirmed job.
              </p>
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  );
}
