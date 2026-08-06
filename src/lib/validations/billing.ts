import { z } from "zod";

/** A line has to say what it is; a blank row on an invoice is a dispute. */
const lineSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Describe the work")
    .max(300, "Keep line descriptions under 300 characters"),
  quantityHundredths: z
    .number()
    .int()
    .min(1, "Quantity must be more than zero")
    .max(1_000_000, "That quantity looks like a typo"),
  unitPriceCents: z
    .number()
    .int("Prices are whole cents")
    .min(0, "A price cannot be negative")
    .max(10_000_000, "That price looks like a typo"),
});

const customerSchema = {
  customerName: z.string().trim().min(2, "Enter the customer's name").max(120),
  customerEmail: z.email("Enter a valid email address").max(254),
  customerPhone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[0-9+()\-.\s]*$/, "Enter a valid phone number")
    .nullish(),
  addressLine1: z.string().trim().max(160).nullish(),
  addressLine2: z.string().trim().max(160).nullish(),
  city: z.string().trim().max(80).nullish(),
  region: z.string().trim().max(3).toUpperCase().nullish(),
  postalCode: z.string().trim().max(12).nullish(),
};

const taxRateBps = z
  .number()
  .int()
  .min(0)
  .max(3_000, "A tax rate above 30% is almost certainly a typo")
  .default(0);

export const quoteInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Give the quote a title")
    .max(160, "Keep the title under 160 characters"),
  notes: z.string().trim().max(2_000).nullish(),
  internalNote: z.string().trim().max(2_000).nullish(),
  ...customerSchema,
  taxRateBps,
  depositCents: z.number().int().min(0).max(10_000_000).default(0),
  /** `validUntil` as `YYYY-MM-DD`, or absent for no expiry. */
  validUntil: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .nullish(),
  lines: z
    .array(lineSchema)
    .min(1, "Add at least one line")
    .max(50, "A quote can hold at most 50 lines"),
});

export const invoiceInputSchema = z.object({
  title: z.string().trim().min(2, "Give the invoice a title").max(160),
  notes: z.string().trim().max(2_000).nullish(),
  ...customerSchema,
  taxRateBps,
  dueAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .nullish(),
  lines: z
    .array(lineSchema)
    .min(1, "Add at least one line")
    .max(50, "An invoice can hold at most 50 lines"),
});

export const declineQuoteSchema = z.object({
  reason: z.string().trim().max(280).nullish(),
});

export type QuoteInput = z.infer<typeof quoteInputSchema>;
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
export type BillingLineInput = z.infer<typeof lineSchema>;
