import { BookingStatus } from "@/generated/prisma/enums";
import type {
  AvailabilityExceptionModel,
  BusinessHourModel,
} from "@/generated/prisma/models";
import {
  type DateKey,
  addDays,
  dateKeyAt,
  dateKeyToUtcMidnight,
  utcMidnightToDateKey,
  wallTimeToInstant,
  weekdayOf,
} from "@/lib/time";
import {
  SLOT_STEP_MINUTES,
  type AvailabilityExceptionInput,
  type BookingSettingsInput,
  type BusinessHourInput,
} from "@/lib/validations/scheduling";
import {
  MemberCapability,
  NotFoundError,
  requireCapability,
  requireMembership,
} from "@/server/businesses/access";
import { prisma } from "@/server/db";

export type OpeningWindow = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

/** A span of time already committed, which cannot be offered again. */
export type BusyInterval = { start: Date; end: Date };

export type DayAvailability = {
  date: DateKey;
  weekday: number;
  /** Slot start instants, ascending. Empty when the day is unbookable. */
  slots: Date[];
};

export type SlotRequest = {
  timezone: string;
  windows: OpeningWindow[];
  /** Dates the business is closed, as `YYYY-MM-DD`. */
  closedDates: ReadonlySet<DateKey>;
  /** Existing bookings. A candidate slot overlapping any of these is not
   *  offered — the database enforces the same rule, this avoids showing a
   *  customer a time that would then be rejected. */
  busy: readonly BusyInterval[];
  durationMinutes: number;
  bufferMinutes: number;
  /** First calendar day to consider, in the business's timezone. */
  fromDate: DateKey;
  days: number;
  /** Notice the business needs, in hours. */
  leadHours: number;
  now: Date;
};

/**
 * Turn opening hours into concrete bookable instants.
 *
 * Pure and database-free so the rules can be tested exhaustively — this is
 * the function a wrong answer from would double-book someone.
 *
 * Rules, in order:
 *   1. A day the business marked closed produces nothing.
 *   2. A slot must fit entirely inside one opening window, including the
 *      buffer reserved after the job.
 *   3. Wall-clock times that a daylight-saving jump skips are dropped rather
 *      than silently shifted to an hour that never happens.
 *   4. Anything sooner than the business's notice period is not offered.
 *   5. Anything overlapping an existing booking is not offered.
 */
export function generateSlots(request: SlotRequest): DayAvailability[] {
  const windowsByWeekday = new Map<number, OpeningWindow[]>();
  for (const window of request.windows) {
    const list = windowsByWeekday.get(window.weekday) ?? [];
    list.push(window);
    windowsByWeekday.set(window.weekday, list);
  }
  for (const list of windowsByWeekday.values()) {
    list.sort((a, b) => a.startMinute - b.startMinute);
  }

  const earliest = request.now.getTime() + request.leadHours * 3_600_000;
  const occupied = request.durationMinutes + request.bufferMinutes;
  // Sorted once so the overlap check can stop early rather than scanning
  // every booking for every candidate slot.
  const busy = [...request.busy].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const days: DayAvailability[] = [];

  /** Half-open overlap: a slot may start exactly when another ends. */
  function isFree(startMillis: number, endMillis: number): boolean {
    for (const interval of busy) {
      const busyStart = interval.start.getTime();
      if (busyStart >= endMillis) break;
      if (interval.end.getTime() > startMillis) return false;
    }
    return true;
  }

  for (let offset = 0; offset < request.days; offset += 1) {
    const date = addDays(request.fromDate, offset);
    const weekday = weekdayOf(date);
    const parsed = date.split("-").map(Number) as [number, number, number];
    const slots: Date[] = [];

    if (!request.closedDates.has(date)) {
      for (const window of windowsByWeekday.get(weekday) ?? []) {
        for (
          let minutes = window.startMinute;
          minutes + occupied <= window.endMinute;
          minutes += SLOT_STEP_MINUTES
        ) {
          const instant = wallTimeToInstant(
            { year: parsed[0], month: parsed[1], day: parsed[2], minutes },
            request.timezone,
          );
          if (instant === null) continue;
          const startMillis = instant.getTime();
          if (startMillis < earliest) continue;
          // The buffer is the provider's, not the customer's: it blocks the
          // slot from being reused, so it counts against existing bookings.
          if (!isFree(startMillis, startMillis + occupied * 60_000)) continue;
          slots.push(instant);
        }
      }
      // Split shifts are generated window by window; a day is shown in order.
      slots.sort((a, b) => a.getTime() - b.getTime());
    }

    days.push({ date, weekday, slots });
  }

  return days;
}

// ── Persistence ──────────────────────────────────────────────────────────

export async function getWeeklyHours(
  userId: string,
  businessId: string,
): Promise<BusinessHourModel[]> {
  await requireMembership(userId, businessId);
  return prisma.businessHour.findMany({
    where: { businessId },
    orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
  });
}

/**
 * Replace the weekly schedule.
 *
 * Delete-then-insert in one transaction: the schedule is a single value, and
 * a partial update would leave a business open at hours it never chose.
 */
export async function setWeeklyHours(
  userId: string,
  businessId: string,
  hours: BusinessHourInput[],
): Promise<void> {
  await requireCapability(
    userId,
    businessId,
    MemberCapability.STOREFRONT,
    "change opening hours",
  );
  await prisma.$transaction([
    prisma.businessHour.deleteMany({ where: { businessId } }),
    prisma.businessHour.createMany({
      data: hours.map((hour) => ({ businessId, ...hour })),
    }),
  ]);
}

export async function listExceptions(
  userId: string,
  businessId: string,
  options: { from?: DateKey } = {},
): Promise<AvailabilityExceptionModel[]> {
  await requireMembership(userId, businessId);
  return prisma.availabilityException.findMany({
    where: {
      businessId,
      ...(options.from
        ? { date: { gte: dateKeyToUtcMidnight(options.from) } }
        : {}),
    },
    orderBy: { date: "asc" },
  });
}

/** Adding the same closed day twice is a no-op, not an error. */
export async function addException(
  userId: string,
  businessId: string,
  input: AvailabilityExceptionInput,
): Promise<void> {
  await requireCapability(
    userId,
    businessId,
    MemberCapability.STOREFRONT,
    "change availability",
  );
  await prisma.availabilityException.upsert({
    where: {
      businessId_date: {
        businessId,
        date: dateKeyToUtcMidnight(input.date),
      },
    },
    create: {
      businessId,
      date: dateKeyToUtcMidnight(input.date),
      note: input.note ?? null,
    },
    update: { note: input.note ?? null },
  });
}

export async function removeException(
  userId: string,
  businessId: string,
  exceptionId: string,
): Promise<void> {
  await requireCapability(
    userId,
    businessId,
    MemberCapability.STOREFRONT,
    "change availability",
  );
  await prisma.availabilityException.deleteMany({
    where: { id: exceptionId, businessId },
  });
}

export async function updateBookingSettings(
  userId: string,
  businessId: string,
  input: BookingSettingsInput,
): Promise<void> {
  await requireCapability(
    userId,
    businessId,
    MemberCapability.STOREFRONT,
    "change booking settings",
  );
  await prisma.business.update({
    where: { id: businessId },
    data: {
      timezone: input.timezone,
      bookingLeadHours: input.bookingLeadHours,
      bookingHorizonDays: input.bookingHorizonDays,
    },
  });
}

// ── Slot lookup ──────────────────────────────────────────────────────────

/** How many days of slots a single lookup will ever compute. */
export const MAX_AVAILABILITY_DAYS = 60;

type AvailabilitySource = {
  timezone: string;
  bookingLeadHours: number;
  bookingHorizonDays: number;
  hours: OpeningWindow[];
  closedDates: ReadonlySet<DateKey>;
  busy: BusyInterval[];
};

function availabilityFor(
  source: AvailabilitySource,
  servicePackage: { durationMinutes: number; bufferMinutes: number },
  options: { days?: number; now?: Date } = {},
): DayAvailability[] {
  const now = options.now ?? new Date();
  const days = Math.min(
    options.days ?? source.bookingHorizonDays,
    source.bookingHorizonDays,
    MAX_AVAILABILITY_DAYS,
  );
  return generateSlots({
    timezone: source.timezone,
    windows: source.hours,
    closedDates: source.closedDates,
    busy: source.busy,
    durationMinutes: servicePackage.durationMinutes,
    bufferMinutes: servicePackage.bufferMinutes,
    // "Today" is the business's today, not the server's.
    fromDate: dateKeyAt(now, source.timezone),
    days,
    leadHours: source.bookingLeadHours,
    now,
  });
}

/**
 * `now` is threaded in rather than read here: slot generation and the
 * already-booked filter must agree on what "now" is, or availability will
 * offer a slot the constraint then rejects.
 */
async function loadSource(
  where: Record<string, unknown>,
  now: Date,
): Promise<{ id: string; source: AvailabilitySource } | null> {
  const business = await prisma.business.findFirst({
    where,
    select: {
      id: true,
      timezone: true,
      bookingLeadHours: true,
      bookingHorizonDays: true,
      hours: { select: { weekday: true, startMinute: true, endMinute: true } },
      availabilityExceptions: { select: { date: true } },
      bookings: {
        // The same statuses the database's exclusion constraint treats as
        // occupying time. Kept in sync deliberately: if these disagree, the
        // UI offers slots the insert then rejects.
        where: {
          status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
          endAt: { gte: now },
        },
        select: { startAt: true, endAt: true },
      },
    },
  });
  if (!business) return null;
  return {
    id: business.id,
    source: {
      timezone: business.timezone,
      bookingLeadHours: business.bookingLeadHours,
      bookingHorizonDays: business.bookingHorizonDays,
      hours: business.hours,
      closedDates: new Set(
        business.availabilityExceptions.map((exception) =>
          utcMidnightToDateKey(exception.date),
        ),
      ),
      busy: business.bookings.map((booking) => ({
        start: booking.startAt,
        end: booking.endAt,
      })),
    },
  };
}

/** Availability preview for the business's own scheduling page. */
export async function previewAvailability(
  userId: string,
  businessId: string,
  packageId: string,
  options: { days?: number; now?: Date } = {},
): Promise<DayAvailability[]> {
  await requireMembership(userId, businessId);
  const now = options.now ?? new Date();
  const [loaded, servicePackage] = await Promise.all([
    loadSource({ id: businessId }, now),
    prisma.servicePackage.findFirst({
      where: { id: packageId, businessId },
      select: { durationMinutes: true, bufferMinutes: true },
    }),
  ]);
  if (!loaded) throw new NotFoundError();
  if (!servicePackage) throw new NotFoundError("service");
  return availabilityFor(loaded.source, servicePackage, { ...options, now });
}

/**
 * Availability for a customer on a public storefront.
 *
 * Keyed by the public slug rather than an internal id, so the marketplace
 * never needs a business's primary key. Only `ACTIVE` businesses and `active`
 * packages resolve, so an unlisted business cannot be probed for its
 * schedule.
 */
export async function publicAvailability(
  slug: string,
  packageId: string,
  options: { days?: number; now?: Date } = {},
): Promise<DayAvailability[] | null> {
  const now = options.now ?? new Date();
  const loaded = await loadSource({ slug, status: "ACTIVE" }, now);
  if (!loaded) return null;

  const servicePackage = await prisma.servicePackage.findFirst({
    where: { id: packageId, businessId: loaded.id, active: true },
    select: { durationMinutes: true, bufferMinutes: true },
  });
  if (!servicePackage) return null;
  return availabilityFor(loaded.source, servicePackage, { ...options, now });
}
