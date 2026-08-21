import type { BetterAuthRateLimitStorage, RateLimit } from "better-auth";
import { Redis } from "ioredis";

import { serverEnv } from "@/lib/env";

/** Namespace for every auth rate-limit key, kept apart from queue keys. */
const PREFIX = "auth:rl";

/**
 * A **fail-fast** Redis client dedicated to auth rate limiting.
 *
 * Deliberately NOT the shared BullMQ connection: that one uses
 * `maxRetriesPerRequest: null` so queue commands never give up — but for an
 * auth request that means a down Redis blocks the whole request forever (the
 * bug that hung sign-up). Here every command fails within ~1s if Redis is
 * unreachable, so `consume()` catches it and fails open instead of hanging.
 */
let cachedClient: Redis | undefined;
function rateLimitRedis(): Redis {
  cachedClient ??= new Redis(serverEnv().REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    commandTimeout: 1000,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 800)),
  });
  // Swallow connection errors; `consume`/`get`/`set` each handle failures and
  // fail open. Without a listener, ioredis would emit unhandled 'error' events.
  cachedClient.on("error", () => {});
  return cachedClient;
}
/**
 * TTL cap for the legacy record path. The atomic `consume` path sets its own
 * per-window TTL; this only bounds the `get`/`set` fallback so a stray record
 * can never outlive any plausible window.
 */
const RECORD_TTL_SECONDS = 60 * 60 * 24;

/**
 * Redis-backed rate-limit storage for Better Auth.
 *
 * Better Auth's default limiter lives in each instance's memory, so behind more
 * than one instance the true rate is multiplied by the instance count and a
 * brute-force attempt simply spreads across them. This backs the limiter with
 * the same Redis the rest of the app already shares, so the credential-endpoint
 * limits in `auth.ts` hold across every instance.
 *
 * `consume` is the atomic path Better Auth prefers: one INCR closes the
 * concurrent-bypass gap where N simultaneous requests each read a stale count
 * before any increment lands. `get`/`set` exist only to satisfy the interface's
 * legacy fallback and are never the counting path while `consume` is present.
 *
 * The limiter fails **open**: if Redis is unreachable, a request is allowed
 * rather than denied. Locking every user out of sign-in during a cache blip is
 * a worse outcome than briefly losing one layer of defence — passwords are
 * still hashed and the account endpoints still validate.
 */
export function redisRateLimitStorage(
  deps: { redis?: Redis } = {},
): BetterAuthRateLimitStorage {
  const client = () => deps.redis ?? rateLimitRedis();

  return {
    async consume(key, rule) {
      const redisKey = `${PREFIX}:c:${key}`;
      try {
        const redis = client();
        const count = await redis.incr(redisKey);
        // Set the window only when the counter is first created; later
        // increments must not extend it, or the window would never reset.
        if (count === 1) {
          await redis.expire(redisKey, rule.window);
        }
        if (count <= rule.max) {
          return { allowed: true, retryAfter: null };
        }
        const ttl = await redis.ttl(redisKey);
        return { allowed: false, retryAfter: ttl > 0 ? ttl : rule.window };
      } catch (error) {
        console.error("[auth] rate-limit consume failed, allowing:", error);
        return { allowed: true, retryAfter: null };
      }
    },

    async get(key) {
      try {
        const raw = await client().get(`${PREFIX}:r:${key}`);
        return raw ? (JSON.parse(raw) as RateLimit) : null;
      } catch (error) {
        console.error("[auth] rate-limit get failed:", error);
        return null;
      }
    },

    async set(key, value) {
      try {
        await client().set(
          `${PREFIX}:r:${key}`,
          JSON.stringify(value),
          "EX",
          RECORD_TTL_SECONDS,
        );
      } catch (error) {
        console.error("[auth] rate-limit set failed:", error);
      }
    },
  };
}
