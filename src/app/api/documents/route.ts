import { NextResponse } from "next/server";

import { BusinessDocumentKind } from "@/generated/prisma/enums";
import { currentMembership } from "@/server/businesses/access";
import {
  DocumentValidationError,
  uploadBusinessDocument,
} from "@/server/businesses/documents";
import { RATE_LIMITS, checkRateLimit } from "@/server/rate-limit";
import { getSession } from "@/server/session";

const KINDS = Object.values(BusinessDocumentKind) as string[];

/**
 * Credential upload. Multipart rather than a server action because the file
 * never needs to round-trip through React state, and this keeps the payload
 * streamed by the platform instead of serialized into an action argument.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const membership = await currentMembership(session.user.id);
  if (!membership) {
    return NextResponse.json(
      { error: "Set up your business first." },
      { status: 403 },
    );
  }

  const limit = await checkRateLimit({
    key: `document-upload:${session.user.id}`,
    ...RATE_LIMITS.upload,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.resetSeconds) } },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  const kind = form.get("kind");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (typeof kind !== "string" || !KINDS.includes(kind)) {
    return NextResponse.json(
      { error: "Choose what kind of document this is." },
      { status: 400 },
    );
  }

  const expiresRaw = form.get("expiresAt");
  let expiresAt: Date | null = null;
  if (typeof expiresRaw === "string" && expiresRaw.trim() !== "") {
    const parsed = new Date(expiresRaw);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "That expiry date isn't valid." },
        { status: 400 },
      );
    }
    expiresAt = parsed;
  }

  try {
    const document = await uploadBusinessDocument(
      session.user.id,
      membership.businessId,
      {
        kind: kind as BusinessDocumentKind,
        filename: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
        expiresAt,
      },
    );
    return NextResponse.json(
      {
        id: document.id,
        title: document.title,
        kind: document.kind,
        status: document.status,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DocumentValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "TOO_LARGE" ? 413 : 400 },
      );
    }
    console.error("[documents] upload failed:", error);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 },
    );
  }
}
