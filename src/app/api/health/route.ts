import { NextResponse } from "next/server";

// Never cache or prerender a health check — it must reflect this instant.
export const dynamic = "force-dynamic";

/**
 * Liveness probe: is the process up and serving?
 *
 * Deliberately checks nothing external. A liveness failure tells an
 * orchestrator to *restart* the container, which would be the wrong response to
 * a database blip — that is what readiness (`/api/ready`) is for. This only
 * fails if the Node process itself cannot respond.
 */
export function GET() {
  return NextResponse.json(
    { status: "ok", uptime: Math.round(process.uptime()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
