/**
 * Wall-clock ↔ instant conversion for a named IANA timezone.
 *
 * A business writes its opening hours as wall-clock times ("we open at 8"),
 * but a booking is an instant. Converting between them is only correct if
 * daylight-saving transitions are respected — 08:00 is a different instant in
 * January than in July, and on the spring-forward morning some wall-clock
 * times do not exist at all.
 *
 * `Intl.DateTimeFormat` is the only timezone database in the platform, so
 * everything here is derived from it rather than from hardcoded offsets.
 * (`Temporal` would make this unnecessary but is not available in Node 24.)
 */

export type WallTime = {
  year: number;
  /** 1-12, not the 0-based month `Date` uses. */
  month: number;
  day: number;
  /** Minutes from midnight. */
  minutes: number;
};

/** A calendar day in a timezone, as `YYYY-MM-DD`. */
export type DateKey = string;

export const MINUTES_PER_DAY = 24 * 60;
const MILLIS_PER_MINUTE = 60_000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Throws on an unknown zone, so bad configuration fails loudly and early. */
export function assertValidTimeZone(timeZone: string): void {
  try {
    partsFormatter(timeZone).format(new Date());
  } catch {
    throw new Error(`Unknown timezone: ${JSON.stringify(timeZone)}`);
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    assertValidTimeZone(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock reading a timezone shows at a given instant. */
export function wallTimeAt(
  instant: Date,
  timeZone: string,
): WallTime & { second: number } {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) => {
    const found = parts.find((part) => part.type === type)?.value;
    if (found === undefined) {
      throw new Error(`Missing ${type} formatting ${timeZone}`);
    }
    return Number(found);
  };
  // `hourCycle: "h23"` still renders midnight as 24 in some ICU versions.
  const hour = read("hour") % 24;
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    minutes: hour * 60 + read("minute"),
    second: read("second"),
  };
}

/**
 * The zone's UTC offset in milliseconds at a given instant. Positive east of
 * Greenwich, so `instant + offset` reads as the local wall clock.
 */
export function zoneOffsetMillis(instant: Date, timeZone: string): number {
  const wall = wallTimeAt(instant, timeZone);
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    Math.floor(wall.minutes / 60),
    wall.minutes % 60,
    wall.second,
  );
  // Milliseconds are not formatted, so compare against a whole second.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Convert a wall-clock time in a zone to the instant it names.
 *
 * Returns `null` when that reading does not exist — the hour skipped by
 * spring-forward. Callers treat a null as "no slot here" rather than silently
 * booking an hour that never happens.
 *
 * When a reading happens *twice* (fall-back), the earlier instant is
 * returned, which is what a customer reading "1:30 AM" expects.
 */
export function wallTimeToInstant(
  wall: WallTime,
  timeZone: string,
): Date | null {
  const naive = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    Math.floor(wall.minutes / 60),
    wall.minutes % 60,
  );

  // Guess using the offset in effect at the naive instant, then correct once
  // using the offset actually in effect at the candidate. Two passes are
  // enough for every real zone: offsets shift by at most a couple of hours.
  let candidate = naive - zoneOffsetMillis(new Date(naive), timeZone);
  const corrected = naive - zoneOffsetMillis(new Date(candidate), timeZone);
  if (corrected !== candidate) {
    candidate = corrected;
  }

  const check = wallTimeAt(new Date(candidate), timeZone);
  if (
    check.year !== wall.year ||
    check.month !== wall.month ||
    check.day !== wall.day ||
    check.minutes !== wall.minutes
  ) {
    return null;
  }
  return new Date(candidate);
}

/** `YYYY-MM-DD` for the calendar day a zone is on at a given instant. */
export function dateKeyAt(instant: Date, timeZone: string): DateKey {
  const { year, month, day } = wallTimeAt(instant, timeZone);
  return formatDateKey(year, month, day);
}

export function formatDateKey(
  year: number,
  month: number,
  day: number,
): DateKey {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse `YYYY-MM-DD`, rejecting impossible dates like `2026-02-30`. */
export function parseDateKey(
  key: string,
): { year: number; month: number; day: number } | null {
  const match = DATE_KEY_PATTERN.exec(key);
  if (!match) return null;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  if (
    asUtc.getUTCFullYear() !== year ||
    asUtc.getUTCMonth() !== month - 1 ||
    asUtc.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/**
 * Step a calendar date by whole days.
 *
 * Done in UTC on purpose: calendar arithmetic must not be perturbed by the
 * zone's offset. The result is a date label, not an instant.
 */
export function addDays(key: DateKey, days: number): DateKey {
  const parsed = parseDateKey(key);
  if (!parsed) throw new Error(`Invalid date: ${JSON.stringify(key)}`);
  const stepped = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day) +
      days * MINUTES_PER_DAY * MILLIS_PER_MINUTE,
  );
  return formatDateKey(
    stepped.getUTCFullYear(),
    stepped.getUTCMonth() + 1,
    stepped.getUTCDate(),
  );
}

/** 0 = Sunday … 6 = Saturday, matching `BusinessHour.weekday`. */
export function weekdayOf(key: DateKey): number {
  const parsed = parseDateKey(key);
  if (!parsed) throw new Error(`Invalid date: ${JSON.stringify(key)}`);
  return new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day),
  ).getUTCDay();
}

/** Midnight UTC for a date label — how whole-day rows are stored. */
export function dateKeyToUtcMidnight(key: DateKey): Date {
  const parsed = parseDateKey(key);
  if (!parsed) throw new Error(`Invalid date: ${JSON.stringify(key)}`);
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
}

/** `2026-08-01` for a whole-day row read back from the database. */
export function utcMidnightToDateKey(date: Date): DateKey {
  return formatDateKey(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

/** "8:00 AM" from minutes past midnight. */
export function formatMinutes(minutes: number): string {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % 1440;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** "24:00" reads as end-of-day, which `formatMinutes` would wrap to 12:00 AM. */
export function formatMinutesRange(start: number, end: number): string {
  const endLabel = end === MINUTES_PER_DAY ? "12:00 AM" : formatMinutes(end);
  return `${formatMinutes(start)} – ${endLabel}`;
}

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
