import { describe, expect, it } from "vitest";

import {
  ONE_UNIT,
  TAX_PRESETS,
  balanceCents,
  documentTotals,
  formatQuantity,
  lineTotalCents,
  parseAmountCents,
  parseQuantity,
  subtotalCents,
  taxCents,
} from "@/lib/money";

const line = (quantityHundredths: number, unitPriceCents: number) => ({
  description: "Work",
  quantityHundredths,
  unitPriceCents,
});

describe("lineTotalCents", () => {
  it("multiplies a whole quantity", () => {
    expect(lineTotalCents(line(300, 5_000))).toBe(15_000);
  });

  it("handles a fractional quantity", () => {
    // 2.5 hours at $95/hr = $237.50
    expect(lineTotalCents(line(250, 9_500))).toBe(23_750);
  });

  it("rounds a fraction of a cent to the nearest cent", () => {
    // 0.33 × $10.00 = $3.30
    expect(lineTotalCents(line(33, 1_000))).toBe(330);
    // 1.005 units is not representable; 1.01 × $9.99 = $10.0899 → $10.09
    expect(lineTotalCents(line(101, 999))).toBe(1_009);
  });

  it("rounds a half cent away from zero, in both directions", () => {
    // 0.5 × 1 cent = 0.5 → 1
    expect(lineTotalCents(line(50, 1))).toBe(1);
    // A credit must reverse exactly, not round the other way.
    expect(lineTotalCents(line(50, -1))).toBe(-1);
  });

  it("returns whole cents for any input", () => {
    for (const quantity of [1, 33, 100, 250, 999]) {
      for (const price of [1, 99, 1_000, 12_345]) {
        expect(Number.isInteger(lineTotalCents(line(quantity, price)))).toBe(
          true,
        );
      }
    }
  });

  it("treats ONE_UNIT as exactly the unit price", () => {
    expect(lineTotalCents(line(ONE_UNIT, 14_950))).toBe(14_950);
  });

  it("is zero for a zero quantity or price", () => {
    expect(lineTotalCents(line(0, 5_000))).toBe(0);
    expect(lineTotalCents(line(300, 0))).toBe(0);
  });
});

describe("subtotalCents", () => {
  it("sums the rounded lines, not the unrounded ones", () => {
    // Three lines each 3.3333… cents. Rounding per line gives 3+3+3 = 9;
    // rounding a raw sum would give 10, and the printed lines would not add
    // up to the printed total.
    const lines = [line(33, 10), line(33, 10), line(33, 10)];
    expect(lines.map(lineTotalCents)).toEqual([3, 3, 3]);
    expect(subtotalCents(lines)).toBe(9);
  });

  it("is zero for no lines", () => {
    expect(subtotalCents([])).toBe(0);
  });

  it("adds up a realistic job", () => {
    const lines = [
      line(250, 9_500), // 2.5 hrs labour @ $95
      line(100, 4_200), // 1 part @ $42
      line(200, 1_250), // 2 consumables @ $12.50
    ];
    expect(subtotalCents(lines)).toBe(23_750 + 4_200 + 2_500);
  });
});

describe("taxCents", () => {
  it.each([
    [10_000, 500, 500],
    [10_000, 1_200, 1_200],
    [10_000, 1_300, 1_300],
    [23_750, 1_200, 2_850],
  ])("charges %i at %i bps as %i", (subtotal, bps, expected) => {
    expect(taxCents(subtotal, bps)).toBe(expected);
  });

  it("is zero when no rate is set", () => {
    expect(taxCents(10_000, 0)).toBe(0);
  });

  it("never returns a fraction of a cent", () => {
    expect(Number.isInteger(taxCents(3_333, 1_498))).toBe(true);
  });

  it("rounds to the nearest cent", () => {
    // 12.5% of 1 cent is 0.125 → 0
    expect(taxCents(1, 1_250)).toBe(0);
    // 12.5% of 12 cents is 1.5 → 2
    expect(taxCents(12, 1_250)).toBe(2);
  });
});

describe("documentTotals", () => {
  it("always satisfies subtotal + tax = total", () => {
    for (const bps of TAX_PRESETS.map((preset) => preset.bps)) {
      for (const lines of [
        [line(100, 9_999)],
        [line(250, 9_500), line(100, 4_200)],
        [line(33, 10), line(1, 1)],
        [],
      ]) {
        const totals = documentTotals(lines, bps);
        expect(totals.subtotalCents + totals.taxCents).toBe(totals.totalCents);
      }
    }
  });

  it("computes a full document", () => {
    const totals = documentTotals([line(250, 9_500), line(100, 4_200)], 1_200);
    expect(totals).toEqual({
      subtotalCents: 27_950,
      taxCents: 3_354,
      totalCents: 31_304,
    });
  });

  it("is all zeroes for an empty document", () => {
    expect(documentTotals([], 1_200)).toEqual({
      subtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
    });
  });
});

describe("formatQuantity", () => {
  it.each([
    [100, "1"],
    [250, "2.5"],
    [300, "3"],
    [33, "0.33"],
    [1, "0.01"],
  ])("renders %i as %s", (hundredths, expected) => {
    expect(formatQuantity(hundredths)).toBe(expected);
  });
});

describe("parseQuantity", () => {
  it.each([
    ["1", 100],
    ["2.5", 250],
    ["0.33", 33],
    ["  3  ", 300],
  ])("parses %j as %i", (input, expected) => {
    expect(parseQuantity(input)).toBe(expected);
  });

  it.each(["", "   ", "abc", "0", "-1", "NaN"])("rejects %j", (input) => {
    expect(parseQuantity(input)).toBeNull();
  });

  it("round-trips through formatQuantity", () => {
    for (const value of [100, 250, 33, 1_000]) {
      expect(parseQuantity(formatQuantity(value))).toBe(value);
    }
  });
});

describe("parseAmountCents", () => {
  it.each([
    ["120", 12_000],
    ["120.50", 12_050],
    ["$99.99", 9_999],
    ["0", 0],
  ])("parses %j as %i", (input, expected) => {
    expect(parseAmountCents(input)).toBe(expected);
  });

  it("rounds rather than truncating a third decimal", () => {
    expect(parseAmountCents("19.999")).toBe(2_000);
  });

  it.each(["", "abc", "-5"])("rejects %j", (input) => {
    expect(parseAmountCents(input)).toBeNull();
  });
});

describe("balanceCents", () => {
  it("is what remains unpaid", () => {
    expect(balanceCents(10_000, 4_000)).toBe(6_000);
  });

  it("is zero once settled", () => {
    expect(balanceCents(10_000, 10_000)).toBe(0);
  });

  it("never goes negative on an overpayment", () => {
    expect(balanceCents(10_000, 12_000)).toBe(0);
  });
});

describe("tax presets", () => {
  it("offers a no-tax option first", () => {
    expect(TAX_PRESETS[0]!.bps).toBe(0);
  });

  it("uses whole basis points within a sane range", () => {
    for (const preset of TAX_PRESETS) {
      expect(Number.isInteger(preset.bps)).toBe(true);
      expect(preset.bps).toBeGreaterThanOrEqual(0);
      expect(preset.bps).toBeLessThan(3_000);
    }
  });
});
