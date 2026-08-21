import { prisma } from "@/server/db";
import { redisConnection } from "@/server/queue/connection";

export type DependencyStatus = {
  name: string;
  ok: boolean;
  /** Round-trip time in milliseconds, when the check succeeded. */
  latencyMs?: number;
  error?: string;
};

export type ReadinessReport = {
  ready: boolean;
  dependencies: DependencyStatus[];
};

/** Reject if `promise` has not settled within `ms`, so a probe can't hang. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/** Time a check, capturing latency and turning any throw into `ok: false`. */
async function probe(
  name: string,
  check: () => Promise<unknown>,
): Promise<DependencyStatus> {
  const start = Date.now();
  try {
    // Bounded so a stuck dependency (e.g. an unreachable Redis whose client
    // never gives up) can never make readiness itself hang.
    await withTimeout(Promise.resolve().then(check), 3000);
    return { name, ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      name,
      ok: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Deep readiness: can the process actually serve traffic right now?
 *
 * Distinct from liveness (is the process up?). A container orchestrator uses
 * readiness to decide whether to route requests here — so it pings the backing
 * stores the app cannot work without. Postgres is checked with the lightest
 * possible query; Redis with a PING. Both run concurrently so a slow dependency
 * does not stack onto the other's latency.
 */
export async function checkReadiness(): Promise<ReadinessReport> {
  const checks = [probe("postgres", () => prisma.$queryRaw`SELECT 1`)];
  // Redis is optional (only rate limiting uses it). Ping it only when one is
  // configured, so a deploy without Redis is still reported ready.
  if (process.env.REDIS_URL) {
    checks.push(probe("redis", () => redisConnection().ping()));
  }
  const dependencies = await Promise.all(checks);

  return {
    ready: dependencies.every((dependency) => dependency.ok),
    dependencies,
  };
}
