import { NextResponse } from "next/server";

import { PlatformRole } from "@/generated/prisma/enums";
import { meetsPlatformRole, platformRoleOf } from "@/server/admin/access";
import { prisma } from "@/server/db";
import { ObjectNotFoundError, storage } from "@/server/storage";
import { getSession } from "@/server/session";

/**
 * Serve any business's credential to a platform reviewer, for verification.
 *
 * This is the one place a document leaves its business boundary, so the gate
 * is a platform role (STAFF or ADMIN), never a membership. The same hardening
 * as the business-facing route applies: forced download, `nosniff`, `no-store`
 * — a reviewer's browser must not execute an uploaded file either.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const role = await platformRoleOf(session.user.id);
  if (!meetsPlatformRole(role, PlatformRole.STAFF)) {
    // 404, not 403: a non-reviewer should not learn this route exists.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { id } = await params;
  const document = await prisma.businessDocument.findUnique({
    where: { id },
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
        "Content-Disposition": `attachment; filename="${encodeURIComponent(document.title)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("[admin/documents] download failed:", error);
    return NextResponse.json({ error: "Download failed." }, { status: 500 });
  }
}
