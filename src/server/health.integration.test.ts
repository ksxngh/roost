// @vitest-environment node
/**
 * Integration test for the readiness probe against the real Postgres and Redis
 * the test environment provides. Readiness is the signal an orchestrator uses
 * to route traffic, so it must genuinely reach both stores — a mock here would
 * defeat the point.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { checkReadiness } from "@/server/health";

beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("roost_test");
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("checkReadiness", () => {
  it("reports ready when Postgres and Redis both answer", async () => {
    const report = await checkReadiness();

    expect(report.ready).toBe(true);
    const names = report.dependencies.map((d) => d.name).sort();
    expect(names).toEqual(["postgres", "redis"]);
    for (const dependency of report.dependencies) {
      expect(dependency.ok).toBe(true);
      expect(dependency.latencyMs).toBeGreaterThanOrEqual(0);
      expect(dependency.error).toBeUndefined();
    }
  });

  it("reports not-ready and names the failure when a dependency throws", async () => {
    const { prisma } = await import("@/server/db");
    vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(
      new Error("connection refused"),
    );

    const report = await checkReadiness();

    expect(report.ready).toBe(false);
    const postgres = report.dependencies.find((d) => d.name === "postgres");
    expect(postgres?.ok).toBe(false);
    expect(postgres?.error).toBe("connection refused");
    // Redis still answered, so it stays healthy — one failure doesn't taint the
    // others.
    expect(report.dependencies.find((d) => d.name === "redis")?.ok).toBe(true);
  });
});
