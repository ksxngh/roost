import { NextResponse } from "next/server";

import { checkReadiness } from "@/server/health";

export const dynamic = "force-dynamic";

/**
 * Readiness probe: can this instance serve real traffic right now?
 *
 * Pings Postgres and Redis. Returns 503 when any dependency is down so an
 * orchestrator stops routing requests here until it recovers — without killing
 * the process (that is liveness). The body names which dependency failed, for
 * debugging, but never leaks connection strings.
 */
export async function GET() {
  const report = await checkReadiness();
  return NextResponse.json(report, {
    status: report.ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
