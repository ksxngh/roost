import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/server/cron";
import { sweepDocumentExpiry } from "@/server/notifications/sweeps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Scheduled document-expiry sweep, for serverless deploys (Vercel Cron).
 *
 * Equivalent to the worker's `document-expiry` job. Unused on a worker-based
 * deploy.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await sweepDocumentExpiry();
  return NextResponse.json(
    { ok: true, ...result },
    { headers: { "Cache-Control": "no-store" } },
  );
}
