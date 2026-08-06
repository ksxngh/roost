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
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.email().default("noreply@roost.local"),
  // Queues and background jobs.
  REDIS_URL: z.url({ protocol: /^rediss?$/ }).default("redis://localhost:6379"),

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

export function parseServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  const result = serverSchema.safeParse(source);
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
  const result = clientSchema.safeParse(source);
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
