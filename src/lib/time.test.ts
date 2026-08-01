import { describe, expect, it } from "vitest";

import {
  MINUTES_PER_DAY,
  addDays,
  assertValidTimeZone,
  dateKeyAt,
  dateKeyToUtcMidnight,
  formatDateKey,
  formatMinutes,
  formatMinutesRange,
  isValidTimeZone,
  parseDateKey,
  utcMidnightToDateKey,
  wallTimeAt,
  wallTimeToInstant,
  weekdayOf,
  zoneOffsetMillis,
} from "@/lib/time";

const VANCOUVER = "America/Vancouver";
const TOKYO = "Asia/Tokyo";
/** No daylight saving, and a half-hour offset. */
const KOLKATA = "Asia/Kolkata";

const HOUR = 3_600_000;

/**
 * In 2026 Vancouver springs forward on 8 March (02:00 → 03:00) and falls back
 * on 1 November (02:00 → 01:00). Both transitions are exercised below.
 */
describe("wallTimeAt", () => {
  it("reads the local clock, not UTC", () => {
    const wall = wallTimeAt(new Date("2026-07-04T20:30:00Z"), VANCOUVER);
    expect(wall).toEqual({
      year: 2026,
      month: 7,
      day: 4,
      minutes: 13 * 60 + 30,
      second: 0,
    });
  });

  it("rolls the date backwards when the zone is behind UTC", () => {
    const wall = wallTimeAt(new Date("2026-07-05T04:00:00Z"), VANCOUVER);
    expect([wall.day, wall.minutes]).toEqual([4, 21 * 60]);
  });

  it("rolls the date forwards when the zone is ahead of UTC", () => {
    const wall = wallTimeAt(new Date("2026-07-04T20:00:00Z"), TOKYO);
    expect([wall.day, wall.minutes]).toEqual([5, 5 * 60]);
  });

  it("reports midnight as zero minutes, not 1440", () => {
    const wall = wallTimeAt(new Date("2026-07-04T07:00:00Z"), VANCOUVER);
    expect(wall.minutes).toBe(0);
  });
});

describe("zoneOffsetMillis", () => {
  it("returns standard time in winter", () => {
    expect(zoneOffsetMillis(new Date("2026-01-15T20:00:00Z"), VANCOUVER)).toBe(
      -8 * HOUR,
    );
  });

  it("returns daylight time in summer", () => {
    expect(zoneOffsetMillis(new Date("2026-07-15T20:00:00Z"), VANCOUVER)).toBe(
      -7 * HOUR,
    );
  });

  it("handles a half-hour offset", () => {
    expect(zoneOffsetMillis(new Date("2026-07-15T20:00:00Z"), KOLKATA)).toBe(
      5.5 * HOUR,
    );
  });

  it("is exact across the spring-forward boundary", () => {
    expect(zoneOffsetMillis(new Date("2026-03-08T09:59:00Z"), VANCOUVER)).toBe(
      -8 * HOUR,
    );
    expect(zoneOffsetMillis(new Date("2026-03-08T10:00:00Z"), VANCOUVER)).toBe(
      -7 * HOUR,
    );
  });
});

describe("wallTimeToInstant", () => {
  it("converts a winter morning using standard time", () => {
    const instant = wallTimeToInstant(
      { year: 2026, month: 1, day: 15, minutes: 8 * 60 },
      VANCOUVER,
    );
    expect(instant?.toISOString()).toBe("2026-01-15T16:00:00.000Z");
  });

  it("converts a summer morning using daylight time", () => {
    const instant = wallTimeToInstant(
      { year: 2026, month: 7, day: 15, minutes: 8 * 60 },
      VANCOUVER,
    );
    expect(instant?.toISOString()).toBe("2026-07-15T15:00:00.000Z");
  });

  it("keeps 8am at 8am on both sides of a transition", () => {
    for (const [month, day] of [
      [3, 7],
      [3, 9],
      [11, 1],
      [11, 2],
    ] as const) {
      const instant = wallTimeToInstant(
        { year: 2026, month, day, minutes: 8 * 60 },
        VANCOUVER,
      );
      expect(wallTimeAt(instant!, VANCOUVER).minutes).toBe(8 * 60);
    }
  });

  it("returns null for a wall time skipped by spring-forward", () => {
    // 02:30 on 8 March 2026 never happens in Vancouver.
    expect(
      wallTimeToInstant(
        { year: 2026, month: 3, day: 8, minutes: 2 * 60 + 30 },
        VANCOUVER,
      ),
    ).toBeNull();
  });

  it("still resolves the hours around a skipped one", () => {
    expect(
      wallTimeToInstant(
        { year: 2026, month: 3, day: 8, minutes: 60 + 30 },
        VANCOUVER,
      )?.toISOString(),
    ).toBe("2026-03-08T09:30:00.000Z");
    expect(
      wallTimeToInstant(
        { year: 2026, month: 3, day: 8, minutes: 3 * 60 + 30 },
        VANCOUVER,
      )?.toISOString(),
    ).toBe("2026-03-08T10:30:00.000Z");
  });

  it("picks the earlier instant for a wall time that happens twice", () => {
    // 01:30 on 1 November 2026 occurs at both -07:00 and -08:00.
    expect(
      wallTimeToInstant(
        { year: 2026, month: 11, day: 1, minutes: 60 + 30 },
        VANCOUVER,
      )?.toISOString(),
    ).toBe("2026-11-01T08:30:00.000Z");
  });

  it("round-trips every half hour of a transition day", () => {
    for (let minutes = 0; minutes < MINUTES_PER_DAY; minutes += 30) {
      const instant = wallTimeToInstant(
        { year: 2026, month: 3, day: 8, minutes },
        VANCOUVER,
      );
      if (instant === null) {
        // Only the skipped hour may be unrepresentable.
        expect(minutes).toBeGreaterThanOrEqual(2 * 60);
        expect(minutes).toBeLessThan(3 * 60);
        continue;
      }
      expect(wallTimeAt(instant, VANCOUVER).minutes).toBe(minutes);
    }
  });

  it("works in a zone ahead of UTC", () => {
    expect(
      wallTimeToInstant(
        { year: 2026, month: 7, day: 15, minutes: 9 * 60 },
        TOKYO,
      )?.toISOString(),
    ).toBe("2026-07-15T00:00:00.000Z");
  });

  it("works in a zone with a half-hour offset", () => {
    expect(
      wallTimeToInstant(
        { year: 2026, month: 7, day: 15, minutes: 9 * 60 },
        KOLKATA,
      )?.toISOString(),
    ).toBe("2026-07-15T03:30:00.000Z");
  });
});

describe("dateKeyAt", () => {
  it("uses the zone's calendar day, not UTC's", () => {
    const instant = new Date("2026-07-05T04:00:00Z");
    expect(dateKeyAt(instant, VANCOUVER)).toBe("2026-07-04");
    expect(dateKeyAt(instant, TOKYO)).toBe("2026-07-05");
  });
});

describe("parseDateKey", () => {
  it("parses a valid date", () => {
    expect(parseDateKey("2026-08-01")).toEqual({
      year: 2026,
      month: 8,
      day: 1,
    });
  });

  it.each([
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "2026-8-1",
    "not-a-date",
    "",
  ])("rejects %j", (value) => {
    expect(parseDateKey(value)).toBeNull();
  });

  it("accepts a leap day in a leap year and rejects it otherwise", () => {
    expect(parseDateKey("2028-02-29")).not.toBeNull();
    expect(parseDateKey("2026-02-29")).toBeNull();
  });
});

describe("addDays", () => {
  it("steps forward across a month boundary", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("steps backward across a year boundary", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("is unaffected by a daylight-saving transition", () => {
    // A naive local-midnight + 24h would land on the same day here.
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("throws on a malformed date", () => {
    expect(() => addDays("nonsense", 1)).toThrow(/Invalid date/);
  });
});

describe("weekdayOf", () => {
  it("returns 0 for Sunday and 6 for Saturday", () => {
    expect(weekdayOf("2026-08-02")).toBe(0);
    expect(weekdayOf("2026-08-01")).toBe(6);
  });

  it("matches Date.getUTCDay across a week", () => {
    for (let offset = 0; offset < 7; offset += 1) {
      const key = addDays("2026-08-01", offset);
      expect(weekdayOf(key)).toBe(dateKeyToUtcMidnight(key).getUTCDay());
    }
  });
});

describe("whole-day storage round trip", () => {
  it("survives conversion in both directions", () => {
    expect(utcMidnightToDateKey(dateKeyToUtcMidnight("2026-08-01"))).toBe(
      "2026-08-01",
    );
  });

  it("stores midnight UTC exactly", () => {
    expect(dateKeyToUtcMidnight("2026-08-01").toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });
});

describe("formatDateKey", () => {
  it("zero-pads month and day", () => {
    expect(formatDateKey(2026, 1, 5)).toBe("2026-01-05");
  });
});

describe("formatMinutes", () => {
  it.each([
    [0, "12:00 AM"],
    [1, "12:01 AM"],
    [8 * 60, "8:00 AM"],
    [12 * 60, "12:00 PM"],
    [12 * 60 + 30, "12:30 PM"],
    [13 * 60 + 5, "1:05 PM"],
    [23 * 60 + 59, "11:59 PM"],
  ])("formats %i as %s", (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });
});

describe("formatMinutesRange", () => {
  it("renders a normal range", () => {
    expect(formatMinutesRange(8 * 60, 17 * 60)).toBe("8:00 AM – 5:00 PM");
  });

  it("renders end-of-day as midnight rather than wrapping", () => {
    expect(formatMinutesRange(20 * 60, MINUTES_PER_DAY)).toBe(
      "8:00 PM – 12:00 AM",
    );
  });
});

describe("timezone validation", () => {
  it("accepts real zones", () => {
    expect(isValidTimeZone(VANCOUVER)).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects nonsense", () => {
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(() => assertValidTimeZone("Mars/Olympus_Mons")).toThrow(
      /Unknown timezone/,
    );
  });
});
