import { createHash, randomUUID } from "node:crypto";

import { fileTypeFromBuffer } from "file-type";

import type { DocumentKind } from "@/generated/prisma/enums";
import {
  extensionOf,
  findTypeByExtension,
  type AcceptedType,
} from "@/server/documents/file-types";

export type ValidatedUpload = {
  title: string;
  kind: DocumentKind;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  storageKey: string;
};

export class UploadValidationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "EMPTY"
      | "TOO_LARGE"
      | "UNSUPPORTED_TYPE"
      | "CONTENT_MISMATCH"
      | "INVALID_NAME",
  ) {
    super(message);
    this.name = "UploadValidationError";
  }
}

const MAX_TITLE_LENGTH = 200;

/**
 * Derive a safe, human-readable title from an uploaded filename.
 *
 * The result is display-only — it never reaches the filesystem, because
 * storage keys are generated independently. Control characters and path
 * separators are stripped so the title cannot be used for UI spoofing or
 * log injection.
 */
export function sanitizeTitle(filename: string): string {
  const withoutPath = filename.split(/[/\\]/).pop() ?? "";
  const withoutExtension = withoutPath.replace(/\.[A-Za-z0-9]+$/, "");
  const cleaned = withoutExtension
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return "Untitled";
  }
  return cleaned.slice(0, MAX_TITLE_LENGTH);
}

/** Object key: namespaced by user, random, with a safe extension. */
export function buildStorageKey(userId: string, extension: string): string {
  const safeExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `${userId}/${randomUUID()}${safeExtension ? `.${safeExtension}` : ""}`;
}

/** True when the buffer decodes as UTF-8 without replacement characters. */
export function looksLikeText(buffer: Buffer): boolean {
  if (buffer.includes(0)) {
    return false;
  }
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  return !decoded.includes("�");
}

/**
 * Validate an uploaded file end to end: size, extension allowlist, and — the
 * part that matters — that the *bytes* match the claimed type. The
 * browser-supplied MIME type is never trusted; a `.pdf` containing an
 * executable is rejected here.
 */
export async function validateUpload({
  filename,
  buffer,
  userId,
  maxBytes,
}: {
  filename: string;
  buffer: Buffer;
  userId: string;
  maxBytes: number;
}): Promise<ValidatedUpload> {
  if (!filename || !filename.trim()) {
    throw new UploadValidationError("Missing file name.", "INVALID_NAME");
  }
  if (buffer.length === 0) {
    throw new UploadValidationError("The file is empty.", "EMPTY");
  }
  if (buffer.length > maxBytes) {
    throw new UploadValidationError(
      `File is larger than the ${Math.floor(maxBytes / 1024 / 1024)} MB limit.`,
      "TOO_LARGE",
    );
  }

  const extension = extensionOf(filename);
  const accepted: AcceptedType | undefined = findTypeByExtension(extension);
  if (!accepted) {
    throw new UploadValidationError(
      `Files of type "${extension || "unknown"}" are not supported.`,
      "UNSUPPORTED_TYPE",
    );
  }

  if (accepted.sniffed === null) {
    // Text formats carry no magic bytes; require decodable UTF-8 so binary
    // content cannot be smuggled in as ".txt".
    if (!looksLikeText(buffer)) {
      throw new UploadValidationError(
        "This file does not appear to be readable text.",
        "CONTENT_MISMATCH",
      );
    }
  } else {
    const sniffed = await fileTypeFromBuffer(buffer);
    if (!sniffed || !accepted.sniffed.includes(sniffed.mime)) {
      throw new UploadValidationError(
        `The file contents do not match a ${extension.toUpperCase()} file.`,
        "CONTENT_MISMATCH",
      );
    }
  }

  return {
    title: sanitizeTitle(filename),
    kind: accepted.kind,
    mimeType: accepted.mimeType,
    sizeBytes: buffer.length,
    checksum: createHash("sha256").update(buffer).digest("hex"),
    storageKey: buildStorageKey(userId, extension),
  };
}
