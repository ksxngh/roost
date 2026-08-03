import { z } from "zod";

/** Loose on purpose: formats vary and it is only ever displayed or dialled. */
const phone = z
  .string()
  .trim()
  .min(7, "Enter a valid phone number")
  .max(32, "Phone number is too long")
  .regex(/^[0-9+()\-.\s]+$/, "Enter a valid phone number");

export const createBookingSchema = z.object({
  packageId: z.string().min(1, "Choose a service"),
  /** ISO instant of the chosen slot; the server checks it is really offered. */
  startAt: z.iso.datetime({ message: "Choose a time" }),

  customerName: z
    .string()
    .trim()
    .min(2, "Enter your name")
    .max(120, "Name is too long"),
  customerEmail: z.email("Enter a valid email address").max(254),
  customerPhone: phone,

  addressLine1: z
    .string()
    .trim()
    .min(3, "Enter the street address")
    .max(160, "Address is too long"),
  addressLine2: z.string().trim().max(160).nullish(),
  city: z.string().trim().min(1, "Enter a city").max(80),
  region: z
    .string()
    .trim()
    .min(2, "Enter a province or state")
    .max(3)
    .toUpperCase(),
  postalCode: z
    .string()
    .trim()
    .min(3, "Enter a postal code")
    .max(12, "Postal code is too long"),
  notes: z
    .string()
    .trim()
    .max(1000, "Keep notes under 1000 characters")
    .nullish(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(280).nullish(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/**
 * Booking reference alphabet.
 *
 * Digits and uppercase letters minus the pairs people misread when reading a
 * code aloud or off a screen: I/1, O/0, S/5, Z/2.
 */
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRTUVWXY346789";
const REFERENCE_LENGTH = 8;

export const REFERENCE_PATTERN = new RegExp(
  `^[${REFERENCE_ALPHABET}]{${REFERENCE_LENGTH}}$`,
);

export function isBookingReference(value: string): boolean {
  return REFERENCE_PATTERN.test(value);
}

/**
 * A reference is the customer's only handle on a booking, so it is generated
 * from a CSPRNG rather than `Math.random` — a guessable code would expose one
 * customer's address and phone number to another.
 */
export function generateReference(
  randomBytes: (size: number) => Uint8Array,
): string {
  const size = REFERENCE_ALPHABET.length;
  // Rejection sampling: plain `byte % size` would favour the first
  // 256 % size letters. The bias is tiny but free to avoid.
  const ceiling = Math.floor(256 / size) * size;

  let reference = "";
  while (reference.length < REFERENCE_LENGTH) {
    for (const byte of randomBytes(REFERENCE_LENGTH)) {
      if (byte >= ceiling) continue;
      reference += REFERENCE_ALPHABET[byte % size];
      if (reference.length === REFERENCE_LENGTH) break;
    }
  }
  return reference;
}
