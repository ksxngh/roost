import { randomUUID } from "node:crypto";

import { fileTypeFromBuffer } from "file-type";

import type { BusinessDocumentKind } from "@/generated/prisma/enums";
import { serverEnv } from "@/lib/env";
import { prisma } from "@/server/db";
import { requireEditor, requireMembership } from "@/server/businesses/access";
import { storage, type Storage } from "@/server/storage";

/**
 * Credentials are reviewed by a human, so the allowlist is deliberately
 * narrower than the general upload allowlist: a licence or certificate of
 * insurance is a PDF or a photo, never a spreadsheet or a presentation.
 */
const ACCEPTED = [
  { mime: "application/pdf", extensions: ["pdf"] },
  { mime: "image/png", extensions: ["png"] },
  { mime: "image/jpeg", extensions: ["jpg", "jpeg"] },
  { mime: "image/webp", extensions: ["webp"] },
] as const;

export const ACCEPT_ATTRIBUTE = ACCEPTED.flatMap((type) =>
  type.extensions.map((extension) => `.${extension}`),
).join(",");

export class DocumentValidationError extends Error {
  constructor(
    message: string,
    readonly code:
      "EMPTY" | "TOO_LARGE" | "UNSUPPORTED_TYPE" | "CONTENT_MISMATCH",
  ) {
    super(message);
    this.name = "DocumentValidationError";
  }
}

const MAX_TITLE_LENGTH = 160;

/** Display-only title. Never reaches a path — storage keys are generated. */
export function sanitizeTitle(filename: string): string {
  const base = (filename.split(/[/\\]/).pop() ?? "").replace(
    /\.[A-Za-z0-9]+$/,
    "",
  );
  const cleaned = base
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Document").slice(0, MAX_TITLE_LENGTH);
}

/**
 * Validate and store one credential.
 *
 * As with every upload, the browser-supplied MIME type is ignored — the
 * bytes decide. A renamed executable is rejected here, before storage.
 */
export async function uploadBusinessDocument(
  userId: string,
  businessId: string,
  input: {
    kind: BusinessDocumentKind;
    filename: string;
    buffer: Buffer;
    expiresAt?: Date | null;
  },
  deps: { store?: Storage; maxBytes?: number } = {},
) {
  await requireEditor(userId, businessId, "upload verification documents");

  const store = deps.store ?? storage();
  const maxBytes = deps.maxBytes ?? serverEnv().MAX_UPLOAD_MB * 1024 * 1024;

  if (input.buffer.length === 0) {
    throw new DocumentValidationError("The file is empty.", "EMPTY");
  }
  if (input.buffer.length > maxBytes) {
    throw new DocumentValidationError(
      `File is larger than the ${Math.floor(maxBytes / 1024 / 1024)} MB limit.`,
      "TOO_LARGE",
    );
  }

  const extension = (
    /\.([A-Za-z0-9]+)$/.exec(input.filename.trim())?.[1] ?? ""
  ).toLowerCase();
  const accepted = ACCEPTED.find((type) =>
    (type.extensions as readonly string[]).includes(extension),
  );
  if (!accepted) {
    throw new DocumentValidationError(
      "Upload a PDF or a photo of the document.",
      "UNSUPPORTED_TYPE",
    );
  }

  const sniffed = await fileTypeFromBuffer(input.buffer);
  if (!sniffed || sniffed.mime !== accepted.mime) {
    throw new DocumentValidationError(
      `The file contents do not match a ${extension.toUpperCase()} file.`,
      "CONTENT_MISMATCH",
    );
  }

  const storageKey = `business/${businessId}/${randomUUID()}.${extension}`;
  await store.put(storageKey, input.buffer, accepted.mime);

  try {
    return await prisma.businessDocument.create({
      data: {
        businessId,
        kind: input.kind,
        title: sanitizeTitle(input.filename),
        storageKey,
        mimeType: accepted.mime,
        sizeBytes: input.buffer.length,
        expiresAt: input.expiresAt ?? null,
        uploadedById: userId,
      },
    });
  } catch (error) {
    // Never leave bytes behind for a row that does not exist.
    await store.delete(storageKey).catch(() => {});
    throw error;
  }
}

/** Documents on file, for the provider's verification page. */
export async function listBusinessDocuments(
  userId: string,
  businessId: string,
) {
  await requireMembership(userId, businessId);
  return prisma.businessDocument.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Delete a credential and its stored bytes. Scoped by businessId so an id
 * belonging to another business can never be removed.
 */
export async function deleteBusinessDocument(
  userId: string,
  businessId: string,
  documentId: string,
  deps: { store?: Storage } = {},
): Promise<void> {
  await requireEditor(userId, businessId, "remove verification documents");
  const document = await prisma.businessDocument.findFirst({
    where: { id: documentId, businessId },
    select: { id: true, storageKey: true },
  });
  if (!document) return;

  await prisma.businessDocument.delete({ where: { id: document.id } });
  try {
    await (deps.store ?? storage()).delete(document.storageKey);
  } catch (error) {
    console.error(
      `[businesses] orphaned stored object ${document.storageKey}:`,
      error,
    );
  }
}
