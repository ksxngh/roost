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

/** Time a check, capturing latency and turning any throw into `ok: false`. */
async function probe(
  name: string,
  check: () => Promise<unknown>,
): Promise<DependencyStatus> {
  const start = Date.now();
  try {
    await check();
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
  const dependencies = await Promise.all([
    probe("postgres", () => prisma.$queryRaw`SELECT 1`),
    probe("redis", () => redisConnection().ping()),
  ]);

  return {
    ready: dependencies.every((dependency) => dependency.ok),
    dependencies,
  };
}
