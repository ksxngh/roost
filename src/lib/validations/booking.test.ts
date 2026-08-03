import { describe, expect, it } from "vitest";

import {
  REFERENCE_PATTERN,
  cancelBookingSchema,
  createBookingSchema,
  generateReference,
  isBookingReference,
} from "@/lib/validations/booking";

const valid = {
  packageId: "pkg_1",
  startAt: "2026-08-03T16:00:00.000Z",
  customerName: "Dana Reyes",
  customerEmail: "dana@example.com",
  customerPhone: "604-555-0188",
  addressLine1: "12 Elm St",
  city: "Surrey",
  region: "bc",
  postalCode: "V3S 1A1",
};

describe("createBookingSchema", () => {
  it("accepts a complete booking and uppercases the province", () => {
    expect(createBookingSchema.parse(valid).region).toBe("BC");
  });

  it("trims free text", () => {
    const parsed = createBookingSchema.parse({
      ...valid,
      customerName: "  Dana Reyes  ",
      addressLine1: "  12 Elm St  ",
    });
    expect(parsed.customerName).toBe("Dana Reyes");
    expect(parsed.addressLine1).toBe("12 Elm St");
  });

  it("allows the optional fields to be absent", () => {
    const parsed = createBookingSchema.parse(valid);
    expect(parsed.addressLine2 ?? null).toBeNull();
    expect(parsed.notes ?? null).toBeNull();
  });

  it.each([
    ["no service", { packageId: "" }],
    ["a one-character name", { customerName: "D" }],
    ["a malformed email", { customerEmail: "not-an-email" }],
    ["a lettered phone number", { customerPhone: "call-me" }],
    ["a two-character address", { addressLine1: "12" }],
    ["an empty city", { city: "   " }],
    ["a one-letter province", { region: "B" }],
    ["a two-character postal code", { postalCode: "V3" }],
  ])("rejects %s", (_label, patch) => {
    expect(createBookingSchema.safeParse({ ...valid, ...patch }).success).toBe(
      false,
    );
  });

  it.each(["", "tomorrow", "2026-08-03", "not-a-date"])(
    "rejects the start time %j",
    (startAt) => {
      expect(createBookingSchema.safeParse({ ...valid, startAt }).success).toBe(
        false,
      );
    },
  );

  it("rejects notes longer than the column allows", () => {
    expect(
      createBookingSchema.safeParse({ ...valid, notes: "x".repeat(1001) })
        .success,
    ).toBe(false);
  });
});

describe("cancelBookingSchema", () => {
  it("accepts an absent reason", () => {
    expect(cancelBookingSchema.parse({}).reason ?? null).toBeNull();
  });

  it("rejects an over-long reason", () => {
    expect(
      cancelBookingSchema.safeParse({ reason: "x".repeat(281) }).success,
    ).toBe(false);
  });
});

describe("generateReference", () => {
  /** Deterministic byte source, so the mapping itself can be asserted. */
  function bytesFrom(values: number[]): (size: number) => Uint8Array {
    let cursor = 0;
    return (size) => {
      const out = new Uint8Array(size);
      for (let index = 0; index < size; index += 1) {
        out[index] = values[cursor % values.length]!;
        cursor += 1;
      }
      return out;
    };
  }

  it("produces eight characters from the safe alphabet", () => {
    const reference = generateReference(bytesFrom([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(reference).toHaveLength(8);
    expect(REFERENCE_PATTERN.test(reference)).toBe(true);
  });

  it("never emits characters that are misread aloud", () => {
    const reference = generateReference(
      bytesFrom(Array.from({ length: 64 }, (_, index) => index * 3)),
    );
    for (const character of "IOSZ0125") {
      expect(reference).not.toContain(character);
    }
  });

  it("rejects biased bytes rather than folding them", () => {
    // 252-255 are above the rejection ceiling for a 28-letter alphabet and
    // must be skipped, not wrapped onto the first four letters.
    const reference = generateReference(bytesFrom([255, 254, 253, 252, 0]));
    expect(reference).toBe("A".repeat(8));
  });

  it("keeps drawing until it has a full reference", () => {
    let calls = 0;
    const source = (size: number) => {
      calls += 1;
      // Every byte in the first draw is rejected.
      return new Uint8Array(size).fill(calls === 1 ? 255 : 0);
    };
    expect(generateReference(source)).toHaveLength(8);
    expect(calls).toBeGreaterThan(1);
  });

  it("produces different references from different bytes", () => {
    const first = generateReference(bytesFrom([0, 1, 2, 3, 4, 5, 6, 7]));
    const second = generateReference(bytesFrom([8, 9, 10, 11, 12, 13, 14, 15]));
    expect(first).not.toBe(second);
  });

  it("is uniform enough not to collide across many draws", () => {
    let counter = 0;
    const source = (size: number) => {
      const out = new Uint8Array(size);
      for (let index = 0; index < size; index += 1) {
        // A simple LCG stands in for a CSPRNG here.
        counter = (counter * 1103515245 + 12345) % 2147483648;
        out[index] = counter % 251;
      }
      return out;
    };
    const seen = new Set<string>();
    for (let index = 0; index < 500; index += 1) {
      seen.add(generateReference(source));
    }
    expect(seen.size).toBe(500);
  });
});

describe("isBookingReference", () => {
  it("accepts a well-formed reference", () => {
    expect(isBookingReference("ABCDEFGH")).toBe(true);
  });

  it.each([
    ["too short", "ABCDEFG"],
    ["too long", "ABCDEFGHJ"],
    ["lowercase", "abcdefgh"],
    ["an excluded letter", "ABCDEFGI"],
    ["an excluded digit", "ABCDEFG0"],
    ["punctuation", "ABCD-EFG"],
    ["empty", ""],
  ])("rejects %s", (_label, value) => {
    expect(isBookingReference(value)).toBe(false);
  });
});
