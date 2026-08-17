import { serverEnv } from "@/lib/env";

/**
 * Authorize a cron request.
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` on every scheduled
 * invocation when the `CRON_SECRET` environment variable is set. These routes
 * run privileged sweeps (emailing customers), so they must never be callable by
 * the public.
 *
 * - If `CRON_SECRET` is set, the header must match exactly.
 * - If it is unset, we refuse in production (a misconfigured deploy should fail
 *   closed, not expose an open trigger) but allow in development, so the sweeps
 *   can be exercised locally without ceremony.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) {
    return serverEnv().NODE_ENV !== "production";
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
