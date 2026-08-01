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
import { Switch } from "@/components/ui/switch";
import { MINUTES_PER_DAY, WEEKDAY_NAMES, formatMinutes } from "@/lib/time";
import { SLOT_STEP_MINUTES } from "@/lib/validations/scheduling";
import { setWeeklyHoursAction } from "@/server/businesses/actions";

export type HourRow = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

type DayState = { open: boolean; startMinute: number; endMinute: number };

const DEFAULT_DAY: DayState = {
  open: false,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
};

/** Every quarter hour, which is the granularity slots are aligned to. */
const TIME_CHOICES = Array.from(
  { length: MINUTES_PER_DAY / SLOT_STEP_MINUTES },
  (_, index) => index * SLOT_STEP_MINUTES,
);

/**
 * One window per day.
 *
 * The schema supports split shifts, but the editor deliberately does not yet:
 * a single open/close pair covers most trades, and the extra UI would obscure
 * the common case. Split shifts set through the API are preserved on read and
 * flattened only if this form is saved.
 */
export function HoursEditor({ hours }: { hours: HourRow[] }) {
  const [days, setDays] = useState<DayState[]>(() =>
    WEEKDAY_NAMES.map((_, weekday) => {
      const existing = hours
        .filter((hour) => hour.weekday === weekday)
        .sort((a, b) => a.startMinute - b.startMinute);
      const first = existing.at(0);
      const last = existing.at(-1);
      return first && last
        ? {
            open: true,
            startMinute: first.startMinute,
            endMinute: last.endMinute,
          }
        : { ...DEFAULT_DAY };
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update(weekday: number, patch: Partial<DayState>) {
    setDays((current) =>
      current.map((day, index) =>
        index === weekday ? { ...day, ...patch } : day,
      ),
    );
  }

  function copyMondayToWeekdays() {
    const monday = days[1]!;
    setDays((current) =>
      current.map((day, index) =>
        index >= 1 && index <= 5 ? { ...monday } : day,
      ),
    );
  }

  function handleSave() {
    setError(null);
    const payload = days.flatMap((day, weekday) =>
      day.open
        ? [
            {
              weekday,
              startMinute: day.startMinute,
              endMinute: day.endMinute,
            },
          ]
        : [],
    );

    const invalidDay = days.findIndex(
      (day) => day.open && day.endMinute <= day.startMinute,
    );
    if (invalidDay !== -1) {
      setError(
        `${WEEKDAY_NAMES[invalidDay]}: closing time must be after opening time.`,
      );
      return;
    }

    startTransition(async () => {
      const result = await setWeeklyHoursAction(payload);
      if (result.ok) toast.success("Hours saved.");
      else setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Weekly hours</CardTitle>
        <CardDescription>
          The hours you take jobs, in your local time. Slots are only offered
          inside these.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {days.map((day, weekday) => (
          <div
            key={WEEKDAY_NAMES[weekday]}
            className="flex flex-wrap items-center gap-3 border-b pb-3 last:border-0 last:pb-0"
          >
            <div className="flex w-40 items-center gap-2">
              <Switch
                id={`day-${weekday}`}
                checked={day.open}
                onCheckedChange={(checked) =>
                  update(weekday, { open: checked })
                }
              />
              <Label htmlFor={`day-${weekday}`} className="cursor-pointer">
                {WEEKDAY_NAMES[weekday]}
              </Label>
            </div>

            {day.open ? (
              <div className="flex items-center gap-2">
                <select
                  aria-label={`${WEEKDAY_NAMES[weekday]} opening time`}
                  value={day.startMinute}
                  onChange={(event) =>
                    update(weekday, { startMinute: Number(event.target.value) })
                  }
                  className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                >
                  {TIME_CHOICES.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {formatMinutes(minutes)}
                    </option>
                  ))}
                </select>
                <span className="text-muted-foreground text-sm">to</span>
                <select
                  aria-label={`${WEEKDAY_NAMES[weekday]} closing time`}
                  value={day.endMinute}
                  onChange={(event) =>
                    update(weekday, { endMinute: Number(event.target.value) })
                  }
                  className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                >
                  {[...TIME_CHOICES.slice(1), MINUTES_PER_DAY].map(
                    (minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes === MINUTES_PER_DAY
                          ? "12:00 AM"
                          : formatMinutes(minutes)}
                      </option>
                    ),
                  )}
                </select>
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">Closed</span>
            )}
          </div>
        ))}

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="gap-2">
        <Button onClick={handleSave} disabled={pending}>
          {pending ? "Saving…" : "Save hours"}
        </Button>
        <Button type="button" variant="ghost" onClick={copyMondayToWeekdays}>
          Copy Monday to weekdays
        </Button>
      </CardFooter>
    </Card>
  );
}
