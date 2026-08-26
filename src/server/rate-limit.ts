import type { Redis } from "ioredis";

import { redisConfigured, redisFailFast } from "@/server/queue/connection";

/** Result returned when Redis is absent or unreachable — never block the user. */
const ALLOW: RateLimitResult = { allowed: true, remaining: 1, resetSeconds: 1 };

export type RateLimitResult = {
  allowed: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
};

/**
 * Fixed-window rate limiter backed by Redis.
 *
 * Shared across instances, unlike the in-memory limiter Better Auth uses for
 * its own endpoints. A fixed window can allow up to 2x the limit across a
 * boundary; that is an acceptable trade for one round trip per call, and the
 * limits here are set with that headroom in mind.
 */
export async function checkRateLimit({
  key,
  limit,
  windowSeconds,
  redis,
}: {
  key: string;
  limit: number;
  windowSeconds: number;
  redis?: Redis;
}): Promise<RateLimitResult> {
  // No Redis configured (e.g. a Vercel deploy without Upstash): fail open
  // rather than reach for a connection that will never succeed. Without this,
  // the request — an upload, a booking — hangs forever waiting on Redis.
  if (!redis && !redisConfigured) return ALLOW;

  const client = redis ?? redisFailFast();
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const redisKey = `ratelimit:${key}:${window}`;

  try {
    const [count] = (await client
      .multi()
      .incr(redisKey)
      // Expire slightly past the window so the key cannot outlive its purpose.
      .expire(redisKey, windowSeconds + 1)
      .exec()) as [[Error | null, number], [Error | null, number]];

    const used = count[1];
    const resetSeconds =
      (window + 1) * windowSeconds - Math.floor(Date.now() / 1000);

    return {
      allowed: used <= limit,
      remaining: Math.max(0, limit - used),
      resetSeconds: Math.max(1, resetSeconds),
    };
  } catch (error) {
    // A Redis blip must never block a legitimate action. Fail open, logged.
    console.error("[rate-limit] check failed, allowing:", error);
    return ALLOW;
  }
}

/** Limits for expensive authenticated endpoints. */
export const RATE_LIMITS = {
  /** Uploads cost storage and OCR CPU, so they are capped per user. */
  upload: { limit: 30, windowSeconds: 60 * 10 },
  /**
   * Booking submission is unauthenticated, so it is capped per client
   * address. Generous enough for a household comparing providers, tight
   * enough that filling a business's calendar takes real effort.
   */
  booking: { limit: 10, windowSeconds: 60 * 10 },
  /**
   * Address autocomplete fires on keystrokes (debounced) and is
   * unauthenticated, so it is capped per client address — high enough for
   * someone typing an address, low enough to protect the upstream geocoder.
   */
  geocode: { limit: 60, windowSeconds: 60 },
} as const;
