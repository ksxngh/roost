// @vitest-environment node
/**
 * Slot generation rules. A wrong answer here books someone at a time their
 * provider is not working, so the daylight-saving and lead-time boundaries
 * are covered exhaustively.
 */
import { describe, expect, it } from "vitest";

import { dateKeyAt, wallTimeAt } from "@/lib/time";
import {
  type OpeningWindow,
  type SlotRequest,
  generateSlots,
} from "@/server/businesses/availability";

const VANCOUVER = "America/Vancouver";

/** Monday–Friday, 9am to 5pm. */
const NINE_TO_FIVE: OpeningWindow[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}));

function request(overrides: Partial<SlotRequest> = {}): SlotRequest {
  return {
    timezone: VANCOUVER,
    windows: NINE_TO_FIVE,
    closedDates: new Set(),
    busy: [],
    durationMinutes: 60,
    bufferMinutes: 0,
    fromDate: "2026-08-03", // a Monday
    days: 1,
    leadHours: 0,
    now: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

/** Local wall-clock start times, for readable assertions. */
function localTimes(slots: Date[], timezone = VANCOUVER): string[] {
  return slots.map((slot) => {
    const wall = wallTimeAt(slot, timezone);
    return `${String(Math.floor(wall.minutes / 60)).padStart(2, "0")}:${String(
      wall.minutes % 60,
    ).padStart(2, "0")}`;
  });
}

describe("generateSlots", () => {
  it("fills an opening window in 15-minute steps", () => {
    const [day] = generateSlots(request());
    expect(day!.slots).toHaveLength(29); // 09:00 … 16:00
    expect(localTimes(day!.slots).at(0)).toBe("09:00");
    expect(localTimes(day!.slots).at(-1)).toBe("16:00");
  });

  it("never offers a slot that would run past closing", () => {
    const [day] = generateSlots(request({ durationMinutes: 120 }));
    expect(localTimes(day!.slots).at(-1)).toBe("15:00");
  });

  it("reserves the buffer inside the working day", () => {
    const [day] = generateSlots(
      request({ durationMinutes: 60, bufferMinutes: 30 }),
    );
    expect(localTimes(day!.slots).at(-1)).toBe("15:30");
  });

  it("returns no slots when the service is longer than the window", () => {
    const [day] = generateSlots(request({ durationMinutes: 9 * 60 }));
    expect(day!.slots).toEqual([]);
  });

  it("returns an entry for every requested day, bookable or not", () => {
    const days = generateSlots(request({ days: 7 }));
    expect(days).toHaveLength(7);
    expect(days.map((day) => day.date.slice(-2))).toEqual([
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
    ]);
  });

  it("produces nothing on a weekday with no opening hours", () => {
    const days = generateSlots(request({ days: 7 }));
    const saturday = days.find((day) => day.weekday === 6);
    const sunday = days.find((day) => day.weekday === 0);
    expect(saturday!.slots).toEqual([]);
    expect(sunday!.slots).toEqual([]);
  });

  it("produces nothing on a day marked closed", () => {
    const days = generateSlots(
      request({ days: 2, closedDates: new Set(["2026-08-03"]) }),
    );
    expect(days[0]!.slots).toEqual([]);
    expect(days[1]!.slots.length).toBeGreaterThan(0);
  });

  it("handles split shifts without gaps or duplicates", () => {
    const windows: OpeningWindow[] = [
      { weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60 },
      { weekday: 1, startMinute: 13 * 60, endMinute: 17 * 60 },
    ];
    const [day] = generateSlots(request({ windows, durationMinutes: 60 }));
    const times = localTimes(day!.slots);

    expect(times.at(0)).toBe("08:00");
    expect(times).toContain("11:00");
    expect(times).not.toContain("12:00");
    expect(times).toContain("13:00");
    expect(times.at(-1)).toBe("16:00");
    expect(new Set(times).size).toBe(times.length);
  });

  it("returns each day's slots in ascending order", () => {
    const windows: OpeningWindow[] = [
      { weekday: 1, startMinute: 13 * 60, endMinute: 17 * 60 },
      { weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60 },
    ];
    const [day] = generateSlots(request({ windows }));
    const times = day!.slots.map((slot) => slot.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe("existing bookings", () => {
  /** 11:00–12:00 local on Monday 3 August 2026 (PDT, UTC-7). */
  const MIDDAY_BOOKING = {
    start: new Date("2026-08-03T18:00:00Z"),
    end: new Date("2026-08-03T19:00:00Z"),
  };

  it("removes every slot that would overlap a booking", () => {
    const [day] = generateSlots(request({ busy: [MIDDAY_BOOKING] }));
    const times = localTimes(day!.slots);

    // A 60-minute service starting 10:15–11:45 would all run into it.
    expect(times).toContain("10:00");
    expect(times).not.toContain("10:15");
    expect(times).not.toContain("11:00");
    expect(times).not.toContain("11:45");
    expect(times).toContain("12:00");
  });

  it("allows a slot that starts exactly when a booking ends", () => {
    const [day] = generateSlots(
      request({ busy: [MIDDAY_BOOKING], durationMinutes: 60 }),
    );
    expect(localTimes(day!.slots)).toContain("12:00");
  });

  it("allows a slot that ends exactly when a booking starts", () => {
    const [day] = generateSlots(
      request({ busy: [MIDDAY_BOOKING], durationMinutes: 60 }),
    );
    expect(localTimes(day!.slots)).toContain("10:00");
  });

  it("counts the buffer against existing bookings", () => {
    const [day] = generateSlots(
      request({
        busy: [MIDDAY_BOOKING],
        durationMinutes: 30,
        bufferMinutes: 30,
      }),
    );
    // 10:30 + 30min work + 30min buffer would run to 11:30, into the booking.
    expect(localTimes(day!.slots)).not.toContain("10:30");
    expect(localTimes(day!.slots)).toContain("10:00");
  });

  it("ignores bookings on other days", () => {
    const days = generateSlots(request({ days: 2, busy: [MIDDAY_BOOKING] }));
    expect(localTimes(days[1]!.slots)).toContain("11:00");
  });

  it("empties a day fully booked end to end", () => {
    const [day] = generateSlots(
      request({
        busy: [
          {
            start: new Date("2026-08-03T16:00:00Z"), // 09:00 local
            end: new Date("2026-08-03T24:00:00Z"), // 17:00 local
          },
        ],
      }),
    );
    expect(day!.slots).toEqual([]);
  });

  it("handles unsorted and overlapping busy intervals", () => {
    const [day] = generateSlots(
      request({
        busy: [
          {
            start: new Date("2026-08-03T22:00:00Z"),
            end: new Date("2026-08-03T23:00:00Z"),
          },
          MIDDAY_BOOKING,
          {
            start: new Date("2026-08-03T18:30:00Z"),
            end: new Date("2026-08-03T19:30:00Z"),
          },
        ],
      }),
    );
    const times = localTimes(day!.slots);
    expect(times).not.toContain("11:00");
    expect(times).not.toContain("12:00");
    expect(times).not.toContain("15:00");
    expect(times).toContain("09:00");
  });
});

describe("lead time", () => {
  it("hides slots inside the notice period", () => {
    const days = generateSlots(
      request({
        days: 2,
        leadHours: 24,
        // Monday 08:00 local — everything before Tuesday 08:00 is too soon.
        now: new Date("2026-08-03T15:00:00Z"),
      }),
    );
    expect(days[0]!.slots).toEqual([]);
    expect(localTimes(days[1]!.slots).at(0)).toBe("09:00");
  });

  it("offers same-day slots when no notice is required", () => {
    const [day] = generateSlots(
      request({ leadHours: 0, now: new Date("2026-08-03T19:30:00Z") }),
    );
    // 12:30 local; the 12:30 slot is exactly now and still offered.
    expect(localTimes(day.slots).at(0)).toBe("12:30");
  });

  it("treats the boundary as available, not too soon", () => {
    const [day] = generateSlots(
      request({ leadHours: 2, now: new Date("2026-08-03T14:00:00Z") }),
    );
    // 07:00 local + 2h notice ⇒ 09:00 is exactly on the boundary.
    expect(localTimes(day.slots).at(0)).toBe("09:00");
  });

  it("empties a day entirely once its last slot is too soon", () => {
    const [day] = generateSlots(
      request({ leadHours: 24, now: new Date("2026-08-03T00:00:00Z") }),
    );
    expect(day!.slots).toEqual([]);
  });
});

describe("daylight saving", () => {
  const earlyWindows: OpeningWindow[] = [0, 1, 2, 3, 4, 5, 6].map(
    (weekday) => ({ weekday, startMinute: 0, endMinute: 6 * 60 }),
  );

  /** These dates precede the default `now`, which would filter every slot. */
  const NEW_YEAR = new Date("2026-01-01T00:00:00Z");

  it("skips wall-clock times the spring-forward jump erases", () => {
    // 8 March 2026: 02:00–03:00 does not exist in Vancouver.
    const [day] = generateSlots(
      request({
        windows: earlyWindows,
        fromDate: "2026-03-08",
        durationMinutes: 15,
        now: NEW_YEAR,
      }),
    );
    const times = localTimes(day!.slots);

    expect(times).toContain("01:45");
    expect(times).not.toContain("02:00");
    expect(times).not.toContain("02:30");
    expect(times).toContain("03:00");
  });

  it("keeps the working day the same length across the transition", () => {
    const before = generateSlots(
      request({ fromDate: "2026-03-06", now: NEW_YEAR }), // Friday before
    );
    const after = generateSlots(
      request({ fromDate: "2026-03-09", now: NEW_YEAR }), // Monday after
    );
    expect(before[0]!.slots.length).toBeGreaterThan(0);
    expect(after[0]!.slots).toHaveLength(before[0]!.slots.length);
  });

  it("keeps 9am at 9am on both sides of a transition", () => {
    for (const fromDate of [
      "2026-03-06",
      "2026-03-09",
      "2026-10-30",
      "2026-11-02",
    ]) {
      const [day] = generateSlots(request({ fromDate, now: NEW_YEAR }));
      expect(localTimes(day!.slots).at(0)).toBe("09:00");
    }
  });

  it("emits the earlier instant for a repeated hour without duplicating it", () => {
    // 1 November 2026: 01:00–02:00 happens twice in Vancouver.
    const [day] = generateSlots(
      request({
        windows: earlyWindows,
        fromDate: "2026-11-01",
        durationMinutes: 15,
        now: NEW_YEAR,
      }),
    );
    const times = localTimes(day!.slots);
    const oneThirty = times.filter((time) => time === "01:30");

    expect(oneThirty).toHaveLength(1);
    expect(new Set(day!.slots.map((slot) => slot.getTime())).size).toBe(
      day!.slots.length,
    );
  });

  it("never produces an instant whose local time is not the intended one", () => {
    const days = generateSlots(
      request({
        windows: earlyWindows,
        fromDate: "2026-03-06",
        days: 5,
        now: NEW_YEAR,
      }),
    );
    for (const day of days) {
      for (const slot of day.slots) {
        expect(dateKeyAt(slot, VANCOUVER)).toBe(day.date);
        expect(wallTimeAt(slot, VANCOUVER).minutes % 15).toBe(0);
      }
    }
  });
});

describe("other timezones", () => {
  it("computes slots for a zone ahead of UTC", () => {
    const [day] = generateSlots(
      request({ timezone: "Asia/Tokyo", fromDate: "2026-08-03" }),
    );
    expect(day!.slots[0]!.toISOString()).toBe("2026-08-03T00:00:00.000Z");
  });

  it("computes slots for a zone with a half-hour offset", () => {
    const [day] = generateSlots(
      request({ timezone: "Asia/Kolkata", fromDate: "2026-08-03" }),
    );
    expect(day!.slots[0]!.toISOString()).toBe("2026-08-03T03:30:00.000Z");
  });

  it("uses the business's calendar day, not the server's", () => {
    const days = generateSlots(
      request({ timezone: "Asia/Tokyo", fromDate: "2026-08-03", days: 1 }),
    );
    expect(dateKeyAt(days[0]!.slots[0]!, "Asia/Tokyo")).toBe("2026-08-03");
  });
});

describe("degenerate input", () => {
  it("returns nothing when the business has no hours", () => {
    const days = generateSlots(request({ windows: [], days: 5 }));
    expect(days.every((day) => day.slots.length === 0)).toBe(true);
  });

  it("returns nothing for a zero-day horizon", () => {
    expect(generateSlots(request({ days: 0 }))).toEqual([]);
  });

  it("handles a window that ends at midnight", () => {
    const windows: OpeningWindow[] = [
      { weekday: 1, startMinute: 22 * 60, endMinute: 24 * 60 },
    ];
    const [day] = generateSlots(request({ windows, durationMinutes: 60 }));
    expect(localTimes(day!.slots)).toEqual([
      "22:00",
      "22:15",
      "22:30",
      "22:45",
      "23:00",
    ]);
  });

  it("produces exactly one slot when the window fits the service exactly", () => {
    const windows: OpeningWindow[] = [
      { weekday: 1, startMinute: 9 * 60, endMinute: 10 * 60 },
    ];
    const [day] = generateSlots(request({ windows, durationMinutes: 60 }));
    expect(localTimes(day!.slots)).toEqual(["09:00"]);
  });
});
