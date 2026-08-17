import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/server/cron";
import { sweepBookingReminders } from "@/server/notifications/sweeps";

export const dynamic = "force-dynamic";
// The sweep talks to Postgres and the mail provider — Node runtime, not edge.
export const runtime = "nodejs";
// A sweep must not be cut off mid-batch.
export const maxDuration = 60;

/**
 * Scheduled booking-reminder sweep, for serverless deploys (Vercel Cron).
 *
 * Equivalent to the worker's `booking-reminders` job: it re-derives everything
 * to remind from the database, so it is safe to run on a fixed schedule with no
 * queue. On a worker-based deploy this route simply goes unused.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await sweepBookingReminders();
  return NextResponse.json(
    { ok: true, ...result },
    { headers: { "Cache-Control": "no-store" } },
  );
}
