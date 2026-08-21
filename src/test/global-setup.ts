import { execSync } from "node:child_process";
import os from "node:os";

/**
 * Vitest global setup: point the process at the throwaway test database and
 * sync the Prisma schema into it. Runs once per `vitest` invocation.
 *
 * TEST_DATABASE_URL overrides the default (CI uses a service container;
 * local dev uses the Homebrew instance).
 */
export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ??
    `postgresql://${os.userInfo().username}@localhost:5432/roost_test`;

  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-42";
  // The queue, rate-limit, and health suites need Redis; pin it so tests run
  // with Redis "configured" (matching CI), and the health readiness check
  // includes the Redis probe.
  process.env.REDIS_URL ??= "redis://localhost:6379";

  // Subscription price ids, so the billing layer runs its configured path.
  process.env.STRIPE_PRICE_PRO_MONTHLY ??= "price_pro_m";
  process.env.STRIPE_PRICE_PRO_ANNUAL ??= "price_pro_a";
  process.env.STRIPE_PRICE_PREMIUM_MONTHLY ??= "price_prem_m";
  process.env.STRIPE_PRICE_PREMIUM_ANNUAL ??= "price_prem_a";

  // Apply the committed migrations (not `db push`) so tests exercise the
  // exact schema that ships to production.
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
