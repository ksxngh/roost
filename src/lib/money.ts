/**
 * Document totals.
 *
 * Every value here is an integer: cents for money, hundredths of a unit for
 * quantities. Nothing is ever a float. A quote and the invoice raised from it
 * must add up to the same number on a provider's screen, in a customer's
 * email, and in Stripe — and binary fractions do not survive that trip.
 *
 * Pure and free of any database, so the arithmetic can be tested exhaustively.
 */

/** One priced row of a quote or invoice. */
export type LineInput = {
  description: string;
  /** Hundredths of a unit: `250` is 2.5 hours. */
  quantityHundredths: number;
  unitPriceCents: number;
};

export type DocumentTotals = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

/** A quantity of exactly one, the common case. */
export const ONE_UNIT = 100;

/**
 * Round half away from zero.
 *
 * `Math.round` rounds half *up*, so -0.5 becomes -0 rather than -1 — which
 * makes a credit line round differently from the charge it reverses.
 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * What one line costs.
 *
 * Rounded once, here. Summing unrounded line values and rounding at the end
 * would produce a total that does not match the printed lines — the classic
 * "invoice is off by a cent" complaint.
 */
export function lineTotalCents(line: LineInput): number {
  return roundHalfAwayFromZero(
    (line.quantityHundredths * line.unitPriceCents) / 100,
  );
}

export function subtotalCents(lines: readonly LineInput[]): number {
  return lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
}

/** Tax on the subtotal, at a rate in basis points (1200 = 12%). */
export function taxCents(subtotal: number, taxRateBps: number): number {
  if (taxRateBps <= 0) return 0;
  return roundHalfAwayFromZero((subtotal * taxRateBps) / 10_000);
}

export function documentTotals(
  lines: readonly LineInput[],
  taxRateBps: number,
): DocumentTotals {
  const subtotal = subtotalCents(lines);
  const tax = taxCents(subtotal, taxRateBps);
  return {
    subtotalCents: subtotal,
    taxCents: tax,
    totalCents: subtotal + tax,
  };
}

/**
 * "2.5" from 250, "1" from 100, "0.33" from 33.
 *
 * Trailing zeros are stripped: a quantity is a count, and "2.50 hours" reads
 * like money rather than time.
 */
export function formatQuantity(quantityHundredths: number): string {
  const whole = quantityHundredths / 100;
  if (Number.isInteger(whole)) return String(whole);
  return whole.toFixed(2).replace(/0$/, "");
}

/** "2.5" back to 250, or null when it isn't a usable quantity. */
export function parseQuantity(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return roundHalfAwayFromZero(parsed * 100);
}

/** "120.50" to 12050, or null when it isn't a usable amount. */
export function parseAmountCents(input: string): number | null {
  const trimmed = input.trim().replace(/^\$/, "");
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return roundHalfAwayFromZero(parsed * 100);
}

/**
 * Canadian sales tax, as a starting point per province.
 *
 * Rates a business can override — this is a convenience, not tax advice, and
 * the provider is responsible for what they charge.
 */
export const TAX_PRESETS: readonly { label: string; bps: number }[] = [
  { label: "No tax", bps: 0 },
  { label: "GST 5%", bps: 500 },
  { label: "GST + PST 12% (BC)", bps: 1200 },
  { label: "HST 13% (ON)", bps: 1300 },
  { label: "HST 15% (NS, NB, NL, PE)", bps: 1500 },
  { label: "GST + QST 14.975% (QC)", bps: 1498 },
];

/** What is still owed on an invoice. Never negative. */
export function balanceCents(
  totalCents: number,
  amountPaidCents: number,
): number {
  return Math.max(0, totalCents - amountPaidCents);
}
