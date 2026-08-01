"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { WEEKDAY_NAMES } from "@/lib/time";

export type PreviewDay = {
  date: string;
  weekday: number;
  /** Pre-formatted in the business's timezone by the server. */
  times: string[];
};

/**
 * What a customer would see. Rendered from server-computed slots — the
 * preview must not have its own idea of availability, or it would reassure a
 * provider about a schedule that isn't real.
 */
export function SlotPreview({
  days,
  packages,
  selectedPackageId,
  timezone,
  totalSlots,
}: {
  days: PreviewDay[];
  packages: { id: string; name: string }[];
  selectedPackageId: string | null;
  timezone: string;
  totalSlots: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectPackage(packageId: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("package", packageId);
    router.replace(`/availability?${next.toString()}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What customers will see</CardTitle>
        <CardDescription>
          The next 7 days of real slots, in {timezone.replace(/_/g, " ")}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {packages.length > 1 ? (
          <div className="space-y-2">
            <Label htmlFor="preview-package">Service</Label>
            <select
              id="preview-package"
              value={selectedPackageId ?? ""}
              onChange={(event) => selectPackage(event.target.value)}
              className="border-input bg-background h-9 w-full max-w-xs rounded-md border px-2 text-sm"
            >
              {packages.map((servicePackage) => (
                <option key={servicePackage.id} value={servicePackage.id}>
                  {servicePackage.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {packages.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Add a service to see bookable times.
          </p>
        ) : totalSlots === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing bookable in the next 7 days. Check your hours, your days
            off, and how much notice you require.
          </p>
        ) : (
          <ul className="space-y-3">
            {days.map((day) => (
              <li key={day.date}>
                <p className="text-sm font-medium">
                  {WEEKDAY_NAMES[day.weekday]}{" "}
                  <span className="text-muted-foreground font-normal">
                    {day.date}
                  </span>
                </p>
                {day.times.length === 0 ? (
                  <p className="text-muted-foreground text-xs">Not available</p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {day.times.map((time) => (
                      <li
                        key={time}
                        className="bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-xs"
                      >
                        {time}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
