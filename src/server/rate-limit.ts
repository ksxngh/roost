import type { Redis } from "ioredis";

import { redisConnection } from "@/server/queue/connection";

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
  const client = redis ?? redisConnection();
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const redisKey = `ratelimit:${key}:${window}`;

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
}

/** Limits for expensive authenticated endpoints. */
export const RATE_LIMITS = {
  /** Uploads cost storage and OCR CPU, so they are capped per user. */
  upload: { limit: 30, windowSeconds: 60 * 10 },
} as const;
