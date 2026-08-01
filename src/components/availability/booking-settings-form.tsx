"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateBookingSettingsAction } from "@/server/businesses/actions";

export type BookingSettings = {
  timezone: string;
  bookingLeadHours: number;
  bookingHorizonDays: number;
};

/**
 * Canadian zones plus the caller's own, so a business outside the list can
 * still keep whatever it was set to rather than being silently relocated.
 */
const BASE_ZONES = [
  "America/Vancouver",
  "America/Edmonton",
  "America/Regina",
  "America/Winnipeg",
  "America/Toronto",
  "America/Halifax",
  "America/St_Johns",
];

const LEAD_CHOICES = [
  { value: 0, label: "None — same-day bookings welcome" },
  { value: 2, label: "2 hours" },
  { value: 12, label: "12 hours" },
  { value: 24, label: "1 day" },
  { value: 48, label: "2 days" },
  { value: 168, label: "1 week" },
];

const HORIZON_CHOICES = [7, 14, 30, 60, 90];

export function BookingSettingsForm({
  settings,
}: {
  settings: BookingSettings;
}) {
  const [form, setForm] = useState(settings);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const zones = BASE_ZONES.includes(form.timezone)
    ? BASE_ZONES
    : [form.timezone, ...BASE_ZONES];

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateBookingSettingsAction(form);
      if (result.ok) toast.success("Booking settings saved.");
      else setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Booking rules</CardTitle>
        <CardDescription>
          Your timezone decides what &ldquo;9am&rdquo; means; the rest decides
          how far out customers can book.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="setting-timezone">Timezone</Label>
          <Select
            value={form.timezone}
            onValueChange={(timezone) =>
              setForm((current) => ({ ...current, timezone }))
            }
          >
            <SelectTrigger id="setting-timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {zones.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone.split("/")[1]?.replace(/_/g, " ") ?? zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="setting-lead">Notice needed</Label>
          <Select
            value={String(form.bookingLeadHours)}
            onValueChange={(value) =>
              setForm((current) => ({
                ...current,
                bookingLeadHours: Number(value),
              }))
            }
          >
            <SelectTrigger id="setting-lead">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_CHOICES.map((choice) => (
                <SelectItem key={choice.value} value={String(choice.value)}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="setting-horizon">Book up to</Label>
          <Select
            value={String(form.bookingHorizonDays)}
            onValueChange={(value) =>
              setForm((current) => ({
                ...current,
                bookingHorizonDays: Number(value),
              }))
            }
          >
            <SelectTrigger id="setting-horizon">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HORIZON_CHOICES.map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {days} days ahead
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error ? (
          <p role="alert" className="text-destructive text-sm sm:col-span-3">
            {error}
          </p>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={pending}>
          {pending ? "Saving…" : "Save booking rules"}
        </Button>
      </CardFooter>
    </Card>
  );
}
