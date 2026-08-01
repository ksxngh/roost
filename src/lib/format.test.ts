import { describe, expect, it } from "vitest";

import { formatBytes, formatRelativeTime, pluralize } from "@/lib/format";

describe("pluralize", () => {
  it("uses the singular for exactly one", () => {
    expect(pluralize(1, "page")).toBe("1 page");
  });

  it("uses the plural for zero and many", () => {
    expect(pluralize(0, "page")).toBe("0 pages");
    expect(pluralize(12, "page")).toBe("12 pages");
  });

  it("accepts an irregular plural", () => {
    expect(pluralize(2, "class", "classes")).toBe("2 classes");
  });
});

describe("formatBytes", () => {
  it("shows bytes below 1 KiB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
  });

  it("scales through KB, MB, and GB", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });

  it("drops the decimal for large values in a unit", () => {
    expect(formatBytes(25 * 1024)).toBe("25 KB");
  });

  it("stops scaling at GB", () => {
    expect(formatBytes(5 * 1024 ** 4)).toContain("GB");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-31T12:00:00Z");

  it("describes the last minute as just now", () => {
    expect(formatRelativeTime(new Date("2026-07-31T11:59:30Z"), now)).toBe(
      "just now",
    );
  });

  it("uses minutes, hours, and days", () => {
    expect(formatRelativeTime(new Date("2026-07-31T11:30:00Z"), now)).toBe(
      "30m ago",
    );
    expect(formatRelativeTime(new Date("2026-07-31T09:00:00Z"), now)).toBe(
      "3h ago",
    );
    expect(formatRelativeTime(new Date("2026-07-29T12:00:00Z"), now)).toBe(
      "2d ago",
    );
  });

  it("falls back to a date beyond a week", () => {
    const result = formatRelativeTime(new Date("2026-07-01T12:00:00Z"), now);
    expect(result).not.toContain("ago");
    expect(result).toMatch(/Jul/);
  });
});
