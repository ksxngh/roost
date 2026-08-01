import { NextResponse } from "next/server";

import { currentMembership } from "@/server/businesses/access";
import { prisma } from "@/server/db";
import { ObjectNotFoundError, storage } from "@/server/storage";
import { getSession } from "@/server/session";

/**
 * Serve a credential back to the business that uploaded it. Documents are
 * never public: they are proxied through this handler so authorization is
 * checked on every read, and storage keys stay server-side.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const membership = await currentMembership(session.user.id);
  if (!membership) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { id } = await params;
  const document = await prisma.businessDocument.findFirst({
    // Scoped by businessId: an id from another business reads as missing.
    where: { id, businessId: membership.businessId },
    select: { storageKey: true, mimeType: true, title: true },
  });
  if (!document) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const body = await storage().get(document.storageKey);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Length": String(body.length),
        // Never render a stored file inline — an uploaded document must not
        // execute in our origin.
        "Content-Disposition": `attachment; filename="${encodeURIComponent(document.title)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("[documents] download failed:", error);
    return NextResponse.json({ error: "Download failed." }, { status: 500 });
  }
}
