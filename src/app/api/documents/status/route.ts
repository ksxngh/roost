import { NextResponse } from "next/server";

import { getDocumentStatuses } from "@/server/library/documents";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/documents/status?ids=a,b,c
 *
 * Narrow endpoint the library polls while documents are being processed, so
 * the page is only refetched when something actually changes.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const statuses = await getDocumentStatuses(session.user.id, ids);
  return NextResponse.json({ statuses });
}
