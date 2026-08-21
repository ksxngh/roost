import { Redis } from "ioredis";

import { serverEnv } from "@/lib/env";

let cached: Redis | undefined;

/**
 * Shared Redis connection for BullMQ.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ: blocking commands must
 * not be aborted by ioredis' retry cap, or workers drop jobs under a brief
 * network blip.
 */
export function redisConnection(): Redis {
  cached ??= new Redis(serverEnv().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  return cached;
}

/** True when a Redis is actually configured (not just the localhost default). */
export const redisConfigured = Boolean(process.env.REDIS_URL);

let cachedFailFast: Redis | undefined;

/**
 * A **fail-fast** Redis connection for request-path features (rate limiting).
 *
 * The opposite of `redisConnection`: commands must give up within ~1s if Redis
 * is unreachable, so a request-time caller can fail open instead of hanging
 * forever. A never-give-up connection on the request path is what hung sign-up
 * and document upload on a deploy with no Redis.
 */
export function redisFailFast(): Redis {
  cachedFailFast ??= new Redis(serverEnv().REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    commandTimeout: 1000,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 800)),
  });
  cachedFailFast.on("error", () => {}); // handled by callers, which fail open
  return cachedFailFast;
}
