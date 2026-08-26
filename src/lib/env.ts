import { z } from "zod";

/**
 * Environment contract. Server code must call `serverEnv()` instead of
 * touching `process.env` so that a missing or malformed variable fails fast
 * with a readable message — at first use, not at request time deep in a
 * handler.
 *
 * Variables graduate from optional to required in the milestone that consumes
 * them; this schema is the single place where that happens.
 */
const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  // Required since Milestone 2 (database & auth).
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  BETTER_AUTH_SECRET: z
    .string()
    .min(
      32,
      "must be at least 32 characters; generate with `openssl rand -base64 32`",
    ),
  // Optional: Google OAuth activates when both are present.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  // Optional: real email delivery activates when present (console otherwise).
  // Brevo takes precedence over Resend when both are set — it can send from a
  // single verified sender without owning a domain, so it works before a
  // domain is bought.
  BREVO_API_KEY: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.email().default("noreply@roost.local"),
  // Queues and background jobs.
  REDIS_URL: z.url({ protocol: /^rediss?$/ }).default("redis://localhost:6379"),
  // Shared secret that authorizes the scheduled sweep routes (`/api/cron/*`).
  // On Vercel, set this and Vercel Cron sends it as a Bearer token. On a
  // worker-based deploy it is unused. See docs/deployment.md.
  CRON_SECRET: z.string().min(1).optional(),

  // Object storage. With no bucket configured the app falls back to the
  // filesystem driver, so local development needs no cloud account.
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).default("auto"),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** Set for S3-compatible providers such as Cloudflare R2. */
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  LOCAL_STORAGE_DIR: z.string().min(1).default(".storage"),

  /** Hard ceiling on a single upload, in megabytes. */
  MAX_UPLOAD_MB: z.coerce.number().int().positive().max(200).default(25),

  // Payments. All three are optional so the app runs without a Stripe
  // account; taking payment is gated on them being present rather than the
  // app refusing to boot. See docs/payments.md.
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  /** Required to verify webhook signatures; without it events are refused. */
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  /**
   * Signing secret for the *Connect* webhook — the separate Stripe event
   * destination that delivers connected-account events (a booking's
   * `checkout.session.completed`, `charge.refunded`, `account.updated`).
   * Stripe fixes an endpoint's event source at creation, so a marketplace
   * needs two destinations with two secrets; the webhook route tries each.
   */
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().min(1).optional(),
  /**
   * Roost's cut, in basis points. Applied to the service price as a Stripe
   * application fee on the connected account's charge.
   *
   * The default must match what `src/lib/plans.ts` advertises — charging more
   * than the pricing page states is the worst kind of bug — and a test
   * asserts the two agree.
   */
  PLATFORM_FEE_BPS: z.coerce
    .number()
    .int()
    .min(0)
    .max(3000, "a fee above 30% is almost certainly a typo")
    .default(800),

  // Subscription price ids from the Stripe dashboard. Subscriptions are only
  // available when the two tiers' monthly ids are present; the annual ids are
  // optional. See docs/subscriptions.md.
  STRIPE_PRICE_PRO_MONTHLY: z.string().min(1).optional(),
  STRIPE_PRICE_PRO_ANNUAL: z.string().min(1).optional(),
  STRIPE_PRICE_PREMIUM_MONTHLY: z.string().min(1).optional(),
  STRIPE_PRICE_PREMIUM_ANNUAL: z.string().min(1).optional(),
});

const clientSchema = z.object({
  // `protocol` matters: a bare "localhost:3000" parses as a valid URL with
  // scheme "localhost:", so plain z.url() would accept it silently.
  NEXT_PUBLIC_APP_URL: z
    .url({ protocol: /^https?$/ })
    .default("http://localhost:3000"),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
}

/**
 * Treat a blank string the same as an absent variable.
 *
 * Zod's `.default()` only substitutes for `undefined` — an explicitly present
 * but empty value fails validation instead of falling back. That is not a
 * hypothetical: hosting dashboards (Vercel included) routinely create a env
 * var entry with an empty value when a field is added but left blank, and the
 * key still ends up in `process.env` as `""`. Stripping blanks here means an
 * unfilled optional field behaves exactly like a variable nobody set.
 */
function withoutBlanks(
  source: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const cleaned: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    cleaned[key] = value === "" ? undefined : value;
  }
  return cleaned;
}

export function parseServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  const result = serverSchema.safeParse(withoutBlanks(source));
  if (!result.success) {
    throw new Error(
      `Invalid server environment variables:\n${formatIssues(result.error)}`,
    );
  }
  return result.data;
}

export function parseClientEnv(
  source: Record<string, string | undefined> = process.env,
): ClientEnv {
  const result = clientSchema.safeParse(withoutBlanks(source));
  if (!result.success) {
    throw new Error(
      `Invalid client environment variables:\n${formatIssues(result.error)}`,
    );
  }
  return result.data;
}

let cachedServerEnv: ServerEnv | undefined;

/** Validated server environment; parsed once on first use. */
export function serverEnv(): ServerEnv {
  cachedServerEnv ??= parseServerEnv();
  return cachedServerEnv;
}
