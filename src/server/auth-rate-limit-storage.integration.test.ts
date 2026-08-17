// @vitest-environment node
/**
 * Integration tests for the Redis-backed Better Auth rate-limit storage,
 * against the same Redis the app uses. The properties that matter: the atomic
 * `consume` path counts correctly across a shared store, blocks past the limit
 * with a real retry-after, resets when the window elapses, and fails *open* so
 * a Redis outage never locks users out.
 */
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { redisRateLimitStorage } from "@/server/auth-rate-limit-storage";

let redis: Redis;

beforeAll(() => {
  redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
});

afterAll(() => {
  redis.disconnect();
});

function uniqueKey(): string {
  return `authrl-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("consume", () => {
  it("allows up to the limit, then blocks with a retry-after", async () => {
    const store = redisRateLimitStorage({ redis });
    const key = uniqueKey();
    const rule = { window: 60, max: 3 };

    for (let i = 0; i < 3; i += 1) {
      const result = await store.consume!(key, rule);
      expect(result).toEqual({ allowed: true, retryAfter: null });
    }

    const blocked = await store.consume!(key, rule);
    expect(blocked.allowed).toBe(false);
    // Retry-after is the remaining window, capped at the configured window.
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(60);
  });

  it("keys are isolated, so one identity does not spend another's budget", async () => {
    const store = redisRateLimitStorage({ redis });
    const rule = { window: 60, max: 1 };
    const a = uniqueKey();
    const b = uniqueKey();

    expect((await store.consume!(a, rule)).allowed).toBe(true);
    expect((await store.consume!(a, rule)).allowed).toBe(false);
    // A different key still has its full budget.
    expect((await store.consume!(b, rule)).allowed).toBe(true);
  });

  it("sets the window only on first hit, so it expires rather than sliding", async () => {
    const store = redisRateLimitStorage({ redis });
    const key = uniqueKey();
    const rule = { window: 1, max: 5 };

    await store.consume!(key, rule);
    await store.consume!(key, rule);
    // The TTL reflects the window set at creation, not extended by the second.
    const ttl = await redis.ttl(`auth:rl:c:${key}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(1);

    // After the window elapses the counter is gone and the budget is fresh.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await redis.exists(`auth:rl:c:${key}`)).toBe(0);
    expect((await store.consume!(key, rule)).allowed).toBe(true);
  });

  it("fails open when Redis is unreachable", async () => {
    const broken = new Redis({ port: 1, lazyConnect: true, maxRetriesPerRequest: 0 });
    // Force every command to reject.
    broken.incr = () => Promise.reject(new Error("down")) as never;
    const store = redisRateLimitStorage({ redis: broken });

    const result = await store.consume!(uniqueKey(), { window: 60, max: 1 });
    expect(result).toEqual({ allowed: true, retryAfter: null });
    broken.disconnect();
  });
});

describe("get/set fallback", () => {
  it("round-trips a rate-limit record with a bounded ttl", async () => {
    const store = redisRateLimitStorage({ redis });
    const key = uniqueKey();

    expect(await store.get(key)).toBeNull();

    await store.set(key, { key, count: 2, lastRequest: Date.now() });
    const record = await store.get(key);
    expect(record).toMatchObject({ key, count: 2 });

    const ttl = await redis.ttl(`auth:rl:r:${key}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 24);
  });
});
