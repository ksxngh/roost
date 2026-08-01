import { describe, expect, it } from "vitest";

import {
  MAX_DURATION_MINUTES,
  availabilityExceptionSchema,
  bookingSettingsSchema,
  businessHourSchema,
  businessHoursSchema,
  formatDuration,
  formatPrice,
  servicePackageSchema,
} from "@/lib/validations/scheduling";

const validPackage = {
  name: "Drain unclogging",
  pricingModel: "FIXED" as const,
  priceCents: 12_000,
  durationMinutes: 60,
  bufferMinutes: 0,
  active: true,
};

describe("servicePackageSchema", () => {
  it("accepts a fixed-price service", () => {
    expect(servicePackageSchema.parse(validPackage).priceCents).toBe(12_000);
  });

  it("defaults the buffer and visibility", () => {
    const parsed = servicePackageSchema.parse({
      name: "Drain unclogging",
      pricingModel: "FIXED",
      priceCents: 12_000,
      durationMinutes: 60,
    });
    expect(parsed.bufferMinutes).toBe(0);
    expect(parsed.active).toBe(true);
  });

  it("allows a quote-priced service with no price", () => {
    const parsed = servicePackageSchema.parse({
      ...validPackage,
      pricingModel: "QUOTE",
      priceCents: null,
    });
    expect(parsed.priceCents).toBeNull();
  });

  it("rejects a fixed price with no number, which would render as free", () => {
    const result = servicePackageSchema.safeParse({
      ...validPackage,
      priceCents: null,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["priceCents"]);
  });

  it("accepts a free service priced at zero", () => {
    expect(
      servicePackageSchema.safeParse({ ...validPackage, priceCents: 0 })
        .success,
    ).toBe(true);
  });

  it("rejects a negative price", () => {
    expect(
      servicePackageSchema.safeParse({ ...validPackage, priceCents: -1 })
        .success,
    ).toBe(false);
  });

  it("rejects fractional cents", () => {
    expect(
      servicePackageSchema.safeParse({ ...validPackage, priceCents: 100.5 })
        .success,
    ).toBe(false);
  });

  it("rejects an implausibly large price", () => {
    expect(
      servicePackageSchema.safeParse({
        ...validPackage,
        priceCents: 10_000_001,
      }).success,
    ).toBe(false);
  });

  it.each([0, 10, 7, MAX_DURATION_MINUTES + 15])(
    "rejects the duration %i",
    (durationMinutes) => {
      expect(
        servicePackageSchema.safeParse({ ...validPackage, durationMinutes })
          .success,
      ).toBe(false);
    },
  );

  it("requires durations on a 15-minute grid", () => {
    expect(
      servicePackageSchema.safeParse({ ...validPackage, durationMinutes: 45 })
        .success,
    ).toBe(true);
    expect(
      servicePackageSchema.safeParse({ ...validPackage, durationMinutes: 50 })
        .success,
    ).toBe(false);
  });

  it("rejects a buffer longer than four hours", () => {
    expect(
      servicePackageSchema.safeParse({
        ...validPackage,
        bufferMinutes: 5 * 60,
      }).success,
    ).toBe(false);
  });

  it("trims the name and rejects a one-character one", () => {
    expect(
      servicePackageSchema.parse({ ...validPackage, name: "  Repair  " }).name,
    ).toBe("Repair");
    expect(
      servicePackageSchema.safeParse({ ...validPackage, name: "R" }).success,
    ).toBe(false);
  });

  it("rejects an unknown pricing model", () => {
    expect(
      servicePackageSchema.safeParse({
        ...validPackage,
        pricingModel: "BARTER",
      }).success,
    ).toBe(false);
  });
});

describe("businessHourSchema", () => {
  it("accepts a normal working day", () => {
    expect(
      businessHourSchema.safeParse({
        weekday: 1,
        startMinute: 9 * 60,
        endMinute: 17 * 60,
      }).success,
    ).toBe(true);
  });

  it("accepts a window ending at midnight", () => {
    expect(
      businessHourSchema.safeParse({
        weekday: 1,
        startMinute: 20 * 60,
        endMinute: 24 * 60,
      }).success,
    ).toBe(true);
  });

  it("rejects a close before the open", () => {
    const result = businessHourSchema.safeParse({
      weekday: 1,
      startMinute: 17 * 60,
      endMinute: 9 * 60,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["endMinute"]);
  });

  it("rejects a zero-length window", () => {
    expect(
      businessHourSchema.safeParse({
        weekday: 1,
        startMinute: 9 * 60,
        endMinute: 9 * 60,
      }).success,
    ).toBe(false);
  });

  it.each([-1, 7, 1.5])("rejects the weekday %s", (weekday) => {
    expect(
      businessHourSchema.safeParse({
        weekday,
        startMinute: 9 * 60,
        endMinute: 17 * 60,
      }).success,
    ).toBe(false);
  });

  it("rejects times off the 15-minute grid", () => {
    expect(
      businessHourSchema.safeParse({
        weekday: 1,
        startMinute: 9 * 60 + 7,
        endMinute: 17 * 60,
      }).success,
    ).toBe(false);
  });

  it("rejects an end past midnight", () => {
    expect(
      businessHourSchema.safeParse({
        weekday: 1,
        startMinute: 9 * 60,
        endMinute: 25 * 60,
      }).success,
    ).toBe(false);
  });
});

describe("businessHoursSchema", () => {
  const monday = { weekday: 1, startMinute: 9 * 60, endMinute: 17 * 60 };

  it("accepts an empty week", () => {
    expect(businessHoursSchema.parse([])).toEqual([]);
  });

  it("accepts a split shift on one day", () => {
    expect(
      businessHoursSchema.safeParse([
        { weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60 },
        { weekday: 1, startMinute: 13 * 60, endMinute: 17 * 60 },
      ]).success,
    ).toBe(true);
  });

  it("accepts the same window on different days", () => {
    expect(
      businessHoursSchema.safeParse([monday, { ...monday, weekday: 2 }])
        .success,
    ).toBe(true);
  });

  it("rejects overlapping windows on the same day", () => {
    expect(
      businessHoursSchema.safeParse([
        monday,
        { weekday: 1, startMinute: 16 * 60, endMinute: 18 * 60 },
      ]).success,
    ).toBe(false);
  });

  it("rejects a duplicated window", () => {
    expect(businessHoursSchema.safeParse([monday, monday]).success).toBe(false);
  });

  it("accepts windows that touch without overlapping", () => {
    expect(
      businessHoursSchema.safeParse([
        { weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60 },
        { weekday: 1, startMinute: 12 * 60, endMinute: 17 * 60 },
      ]).success,
    ).toBe(true);
  });

  it("rejects a window fully containing another", () => {
    expect(
      businessHoursSchema.safeParse([
        { weekday: 1, startMinute: 8 * 60, endMinute: 18 * 60 },
        { weekday: 1, startMinute: 9 * 60, endMinute: 17 * 60 },
      ]).success,
    ).toBe(false);
  });
});

describe("availabilityExceptionSchema", () => {
  it("accepts a valid date", () => {
    expect(availabilityExceptionSchema.parse({ date: "2026-12-25" }).date).toBe(
      "2026-12-25",
    );
  });

  it.each(["2026-02-30", "25-12-2026", "tomorrow", ""])(
    "rejects %j",
    (date) => {
      expect(availabilityExceptionSchema.safeParse({ date }).success).toBe(
        false,
      );
    },
  );

  it("rejects an over-long note", () => {
    expect(
      availabilityExceptionSchema.safeParse({
        date: "2026-12-25",
        note: "x".repeat(141),
      }).success,
    ).toBe(false);
  });
});

describe("bookingSettingsSchema", () => {
  const valid = {
    timezone: "America/Vancouver",
    bookingLeadHours: 24,
    bookingHorizonDays: 30,
  };

  it("accepts sensible settings", () => {
    expect(bookingSettingsSchema.parse(valid)).toEqual(valid);
  });

  it("accepts zero notice", () => {
    expect(
      bookingSettingsSchema.safeParse({ ...valid, bookingLeadHours: 0 })
        .success,
    ).toBe(true);
  });

  it("rejects an unknown timezone", () => {
    expect(
      bookingSettingsSchema.safeParse({ ...valid, timezone: "Mars/Base" })
        .success,
    ).toBe(false);
  });

  it("rejects a zero-day horizon, which would hide every slot", () => {
    expect(
      bookingSettingsSchema.safeParse({ ...valid, bookingHorizonDays: 0 })
        .success,
    ).toBe(false);
  });

  it("rejects negative notice", () => {
    expect(
      bookingSettingsSchema.safeParse({ ...valid, bookingLeadHours: -1 })
        .success,
    ).toBe(false);
  });
});

describe("formatPrice", () => {
  it("drops the decimals on a whole-dollar amount", () => {
    expect(formatPrice(12_000)).toBe("$120");
  });

  it("keeps the cents when there are any", () => {
    expect(formatPrice(12_050)).toBe("$120.50");
  });

  it("formats zero", () => {
    expect(formatPrice(0)).toBe("$0");
  });
});

describe("formatDuration", () => {
  it.each([
    [30, "30 min"],
    [60, "1 hr"],
    [90, "1 hr 30 min"],
    [480, "8 hr"],
    [15, "15 min"],
  ])("formats %i as %s", (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});
