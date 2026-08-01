import { z } from "zod";

import { MINUTES_PER_DAY, isValidTimeZone, parseDateKey } from "@/lib/time";

/** Slot starts are aligned to this, so a schedule stays readable. */
export const SLOT_STEP_MINUTES = 15;

export const MIN_DURATION_MINUTES = 15;
/** A single bookable block; anything longer is a multi-day job, not a slot. */
export const MAX_DURATION_MINUTES = 12 * 60;
export const MAX_BUFFER_MINUTES = 4 * 60;
/** $100,000 — high enough for a real job, low enough to catch a typo. */
export const MAX_PRICE_CENTS = 10_000_000;

const durationMinutes = z
  .number()
  .int("Enter whole minutes")
  .min(MIN_DURATION_MINUTES, `At least ${MIN_DURATION_MINUTES} minutes`)
  .max(MAX_DURATION_MINUTES, "At most 12 hours")
  .refine(
    (value) => value % SLOT_STEP_MINUTES === 0,
    `Use ${SLOT_STEP_MINUTES}-minute steps`,
  );

export const servicePackageSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name your service")
      .max(120, "Name must be at most 120 characters"),
    description: z.string().trim().max(1000).nullish(),
    categoryId: z.string().min(1).nullish(),
    pricingModel: z.enum(["FIXED", "HOURLY", "QUOTE"]),
    priceCents: z
      .number()
      .int("Enter a whole number of cents")
      .min(0, "Price cannot be negative")
      .max(MAX_PRICE_CENTS, "That price looks like a typo")
      .nullish(),
    durationMinutes,
    bufferMinutes: z
      .number()
      .int()
      .min(0)
      .max(MAX_BUFFER_MINUTES, "At most 4 hours")
      .refine(
        (value) => value % SLOT_STEP_MINUTES === 0,
        `Use ${SLOT_STEP_MINUTES}-minute steps`,
      )
      .default(0),
    active: z.boolean().default(true),
  })
  // A priced model without a price would render as "$0", which reads as free.
  .refine(
    (value) =>
      value.pricingModel === "QUOTE" || typeof value.priceCents === "number",
    { message: "Enter a price", path: ["priceCents"] },
  );

export const businessHourSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z
      .number()
      .int()
      .min(0)
      .max(MINUTES_PER_DAY - 1),
    endMinute: z.number().int().min(1).max(MINUTES_PER_DAY),
  })
  .refine((value) => value.endMinute > value.startMinute, {
    message: "Closing time must be after opening time",
    path: ["endMinute"],
  })
  .refine(
    (value) =>
      value.startMinute % SLOT_STEP_MINUTES === 0 &&
      value.endMinute % SLOT_STEP_MINUTES === 0,
    { message: `Use ${SLOT_STEP_MINUTES}-minute steps`, path: ["startMinute"] },
  );

/**
 * The full weekly schedule, replaced as one value.
 *
 * Overlapping windows on the same day are rejected here rather than merged:
 * a business that types 9–5 twice has made a mistake worth showing them, and
 * slot generation would otherwise emit duplicate times.
 */
export const businessHoursSchema = z
  .array(businessHourSchema)
  .max(21, "At most three windows per day")
  .refine(
    (hours) => {
      const byDay = new Map<number, { start: number; end: number }[]>();
      for (const hour of hours) {
        const windows = byDay.get(hour.weekday) ?? [];
        if (
          windows.some(
            (existing) =>
              hour.startMinute < existing.end &&
              existing.start < hour.endMinute,
          )
        ) {
          return false;
        }
        windows.push({ start: hour.startMinute, end: hour.endMinute });
        byDay.set(hour.weekday, windows);
      }
      return true;
    },
    { message: "Two windows on the same day overlap" },
  );

export const dateKeySchema = z
  .string()
  .trim()
  .refine((value) => parseDateKey(value) !== null, "Enter a valid date");

export const availabilityExceptionSchema = z.object({
  date: dateKeySchema,
  note: z.string().trim().max(140).nullish(),
});

export const bookingSettingsSchema = z.object({
  timezone: z
    .string()
    .trim()
    .refine(isValidTimeZone, "Choose a valid timezone"),
  bookingLeadHours: z
    .number()
    .int()
    .min(0, "Cannot be negative")
    .max(30 * 24, "At most 30 days"),
  bookingHorizonDays: z
    .number()
    .int()
    .min(1, "Customers need at least one day to book")
    .max(365, "At most a year"),
});

export type ServicePackageInput = z.infer<typeof servicePackageSchema>;
export type BusinessHourInput = z.infer<typeof businessHourSchema>;
export type AvailabilityExceptionInput = z.infer<
  typeof availabilityExceptionSchema
>;
export type BookingSettingsInput = z.infer<typeof bookingSettingsSchema>;

/** "$120.00" — money is stored in cents and only formatted at the edge. */
export function formatPrice(cents: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** "1 hr 30 min" */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}
