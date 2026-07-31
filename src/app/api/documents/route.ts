import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import {
  DuplicateDocumentError,
  InvalidDestinationError,
  UploadValidationError,
  uploadDocument,
} from "@/server/documents/upload-document";
import { RATE_LIMITS, checkRateLimit } from "@/server/rate-limit";
import { getSession } from "@/server/session";

// Uploads stream through Node APIs and can be large; never pre-render.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/documents — multipart upload of one study file. */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `upload:${session.user.id}`,
    ...RATE_LIMITS.upload,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please wait a moment and try again." },
      {
        status: 429,
        headers: { "retry-after": String(limit.resetSeconds) },
      },
    );
  }

  const maxBytes = serverEnv().MAX_UPLOAD_MB * 1024 * 1024;

  // Reject oversized bodies from the declared length before buffering them.
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes * 1.1) {
    return NextResponse.json(
      { error: `Files must be ${serverEnv().MAX_UPLOAD_MB} MB or smaller.` },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Malformed upload request." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file was included in the upload." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const document = await uploadDocument({
      userId: session.user.id,
      filename: file.name,
      buffer,
      classId: asOptionalId(form.get("classId")),
      folderId: asOptionalId(form.get("folderId")),
    });

    return NextResponse.json(
      {
        document: {
          id: document.id,
          title: document.title,
          kind: document.kind,
          status: document.status,
          sizeBytes: document.sizeBytes,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "TOO_LARGE" ? 413 : 400 },
      );
    }
    if (error instanceof DuplicateDocumentError) {
      return NextResponse.json(
        { error: error.message, documentId: error.existing.id },
        { status: 409 },
      );
    }
    if (error instanceof InvalidDestinationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/documents] upload failed:", error);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 },
    );
  }
}

function asOptionalId(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
