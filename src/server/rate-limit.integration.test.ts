// @vitest-environment node
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { checkRateLimit } from "@/server/rate-limit";

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
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("checkRateLimit", () => {
  it("allows requests up to the limit and blocks the next one", async () => {
    const key = uniqueKey();
    const results = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(
        await checkRateLimit({ key, limit: 3, windowSeconds: 60, redis }),
      );
    }

    expect(results.slice(0, 3).every((r) => r.allowed)).toBe(true);
    expect(results[3]!.allowed).toBe(false);
  });

  it("reports remaining requests accurately", async () => {
    const key = uniqueKey();
    const first = await checkRateLimit({
      key,
      limit: 5,
      windowSeconds: 60,
      redis,
    });
    expect(first.remaining).toBe(4);

    const second = await checkRateLimit({
      key,
      limit: 5,
      windowSeconds: 60,
      redis,
    });
    expect(second.remaining).toBe(3);
  });

  it("never reports negative remaining once exhausted", async () => {
    const key = uniqueKey();
    for (let i = 0; i < 5; i += 1) {
      await checkRateLimit({ key, limit: 1, windowSeconds: 60, redis });
    }
    const result = await checkRateLimit({
      key,
      limit: 1,
      windowSeconds: 60,
      redis,
    });
    expect(result.remaining).toBe(0);
  });

  it("tracks separate keys independently", async () => {
    const a = uniqueKey();
    const b = uniqueKey();
    await checkRateLimit({ key: a, limit: 1, windowSeconds: 60, redis });
    await checkRateLimit({ key: a, limit: 1, windowSeconds: 60, redis });

    const other = await checkRateLimit({
      key: b,
      limit: 1,
      windowSeconds: 60,
      redis,
    });
    expect(other.allowed).toBe(true);
  });

  it("returns a positive reset time within the window", async () => {
    const result = await checkRateLimit({
      key: uniqueKey(),
      limit: 10,
      windowSeconds: 60,
      redis,
    });
    expect(result.resetSeconds).toBeGreaterThan(0);
    expect(result.resetSeconds).toBeLessThanOrEqual(60);
  });

  it("expires its keys so counters cannot leak", async () => {
    const key = uniqueKey();
    await checkRateLimit({ key, limit: 5, windowSeconds: 60, redis });
    const window = Math.floor(Date.now() / 1000 / 60);
    const ttl = await redis.ttl(`ratelimit:${key}:${window}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(61);
  });

  it("resets when the window advances", async () => {
    const key = uniqueKey();
    // A 1-second window makes the rollover observable without a long wait.
    await checkRateLimit({ key, limit: 1, windowSeconds: 1, redis });
    const blocked = await checkRateLimit({
      key,
      limit: 1,
      windowSeconds: 1,
      redis,
    });
    expect(blocked.allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const afterReset = await checkRateLimit({
      key,
      limit: 1,
      windowSeconds: 1,
      redis,
    });
    expect(afterReset.allowed).toBe(true);
  });
});
