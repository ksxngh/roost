import { z } from "zod";

/**
 * Turn a business name into a URL-safe slug.
 *
 * Storefront slugs are public URLs, so this is deliberately conservative:
 * ASCII lowercase, digits, and single hyphens only. Accented characters are
 * folded rather than dropped so "Café Cleaning" stays "cafe-cleaning" instead
 * of collapsing to "cleaning".
 */
export function slugify(input: string): string {
  return (
    input
      .normalize("NFKD")
      // Strip combining marks left behind by the decomposition.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "")
  );
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slugs that would collide with real routes or look official. */
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "billing",
  "book",
  "clients",
  "dashboard",
  "help",
  "invoices",
  "login",
  "logout",
  "new",
  "pricing",
  "pro",
  "quotes",
  "roost",
  "schedule",
  "services",
  "settings",
  "signup",
  "storefront",
  "support",
  "terms",
  "privacy",
]);

export const businessSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Must be at least 3 characters")
  .max(60, "Must be at most 60 characters")
  .regex(SLUG_PATTERN, "Use lowercase letters, numbers, and hyphens only")
  .refine((slug) => !RESERVED_SLUGS.has(slug), "That address is reserved");

const businessName = z
  .string()
  .trim()
  .min(2, "Enter your business name")
  .max(120, "Name must be at most 120 characters");

/** Loose on purpose: international formats vary and we only display it. */
const phone = z
  .string()
  .trim()
  .min(7, "Enter a valid phone number")
  .max(32, "Phone number is too long")
  .regex(/^[0-9+()\-.\s]+$/, "Enter a valid phone number");

export const createBusinessSchema = z.object({
  name: businessName,
  categoryIds: z
    .array(z.string().min(1))
    .min(1, "Choose at least one service you offer")
    .max(10, "Choose up to 10 services"),
  serviceAreas: z
    .array(
      z.object({
        city: z.string().trim().min(1, "Enter a city").max(80),
        region: z
          .string()
          .trim()
          .min(2, "Enter a province or state")
          .max(3)
          .toUpperCase(),
        country: z.string().trim().length(2).toUpperCase().default("CA"),
      }),
    )
    .min(1, "Add at least one area you serve")
    .max(25, "Add up to 25 areas"),
});

export const updateBusinessProfileSchema = z.object({
  name: businessName,
  tagline: z.string().trim().max(140).nullish(),
  about: z.string().trim().max(2000).nullish(),
  phone: phone.nullish(),
  email: z.email("Enter a valid email address").max(254).nullish(),
  website: z
    .url({ protocol: /^https?$/ })
    .max(300)
    .nullish(),
});

export const serviceAreaSchema = z.object({
  city: z.string().trim().min(1, "Enter a city").max(80),
  region: z.string().trim().min(2).max(3).toUpperCase(),
  country: z.string().trim().length(2).toUpperCase().default("CA"),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessProfileInput = z.infer<
  typeof updateBusinessProfileSchema
>;
export type ServiceAreaInput = z.infer<typeof serviceAreaSchema>;
