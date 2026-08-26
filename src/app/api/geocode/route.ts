import { NextResponse } from "next/server";

import { searchAddresses } from "@/server/geo/geocode";
import { RATE_LIMITS, checkRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";
// Talks to an upstream geocoder over the network — Node runtime.
export const runtime = "nodejs";

function clientKey(request: Request): string {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/**
 * Address autocomplete for the booking form.
 *
 * A thin, rate-limited proxy in front of the geocoder: it keeps the provider
 * server-side (swappable, and no key ever reaches the browser) and stops the
 * public endpoint from being used to hammer the upstream. Always 200 with a
 * (possibly empty) list — the caller degrades to manual entry, never an error.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";

  const limit = await checkRateLimit({
    key: `geocode:${clientKey(request)}`,
    ...RATE_LIMITS.geocode,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { suggestions: [] },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  const suggestions = await searchAddresses(query, { country: "CA" });
  return NextResponse.json(
    { suggestions },
    { headers: { "Cache-Control": "no-store" } },
  );
}
