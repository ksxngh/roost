/**
 * Money rules.
 *
 * Every amount in the system is an integer number of cents. Floating-point
 * dollars are never stored, compared, or summed — a cent lost to binary
 * rounding is a cent someone has to reconcile by hand.
 */

/** Stripe's minimum charge for CAD/USD. Below this, checkout fails. */
export const MIN_CHARGE_CENTS = 50;

/**
 * Roost's cut of a booking.
 *
 * Rounded **down**, so rounding never takes more from the provider than the
 * stated percentage. The fee is also capped below the charge itself: a fee
 * equal to the whole amount would leave the provider nothing and Stripe would
 * reject it.
 */
export function platformFeeCents(
  amountCents: number,
  feeBasisPoints: number,
): number {
  if (amountCents <= 0 || feeBasisPoints <= 0) return 0;
  const fee = Math.floor((amountCents * feeBasisPoints) / 10_000);
  return Math.min(fee, amountCents - 1);
}

/** What the provider keeps, after Roost's cut. */
export function providerNetCents(
  amountCents: number,
  feeBasisPoints: number,
): number {
  return amountCents - platformFeeCents(amountCents, feeBasisPoints);
}

export type ChargeableReason =
  "ok" | "no-price" | "below-minimum" | "not-connected";

/**
 * Can this booking be paid for online?
 *
 * Quote-priced work has no number to charge yet, and hourly work is billed on
 * actual time — both are invoiced later (Milestone 7) rather than guessed at
 * now. Returning a reason rather than a boolean lets the UI explain itself.
 */
export function chargeability(input: {
  pricingModel: "FIXED" | "HOURLY" | "QUOTE";
  priceCents: number | null;
  chargesEnabled: boolean;
}): ChargeableReason {
  if (!input.chargesEnabled) return "not-connected";
  if (input.pricingModel !== "FIXED" || input.priceCents === null) {
    return "no-price";
  }
  if (input.priceCents < MIN_CHARGE_CENTS) return "below-minimum";
  return "ok";
}

export function isChargeable(input: {
  pricingModel: "FIXED" | "HOURLY" | "QUOTE";
  priceCents: number | null;
  chargesEnabled: boolean;
}): boolean {
  return chargeability(input) === "ok";
}
