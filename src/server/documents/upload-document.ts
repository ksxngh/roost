import { serverEnv } from "@/lib/env";
import type { DocumentModel } from "@/generated/prisma/models";
import { prisma } from "@/server/db";
import {
  UploadValidationError,
  validateUpload,
} from "@/server/documents/validate-upload";
import { enqueueDocumentProcessing } from "@/server/queue/queues";
import { storage, type Storage } from "@/server/storage";

export class DuplicateDocumentError extends Error {
  constructor(readonly existing: Pick<DocumentModel, "id" | "title">) {
    super(`This file was already uploaded as "${existing.title}".`);
    this.name = "DuplicateDocumentError";
  }
}

export class InvalidDestinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDestinationError";
  }
}

export type UploadRequest = {
  userId: string;
  filename: string;
  buffer: Buffer;
  classId?: string | null;
  folderId?: string | null;
};

/**
 * Validate, store, and register an uploaded file, then queue text extraction.
 *
 * The object is written before the row, so a document row always has bytes
 * behind it; if the insert then fails, the orphaned object is cleaned up.
 * The reverse order would allow a row whose file never arrived.
 */
export async function uploadDocument(
  request: UploadRequest,
  deps: { store?: Storage; maxBytes?: number } = {},
): Promise<DocumentModel> {
  const store = deps.store ?? storage();
  const maxBytes = deps.maxBytes ?? serverEnv().MAX_UPLOAD_MB * 1024 * 1024;

  const validated = await validateUpload({
    filename: request.filename,
    buffer: request.buffer,
    userId: request.userId,
    maxBytes,
  });

  await assertDestinationBelongsToUser(request);

  // Reject an exact re-upload before spending storage on it.
  const duplicate = await prisma.document.findFirst({
    where: {
      userId: request.userId,
      checksum: validated.checksum,
      deletedAt: null,
    },
    select: { id: true, title: true },
  });
  if (duplicate) {
    throw new DuplicateDocumentError(duplicate);
  }

  await store.put(validated.storageKey, request.buffer, validated.mimeType);

  let document: DocumentModel;
  try {
    document = await prisma.document.create({
      data: {
        title: validated.title,
        kind: validated.kind,
        mimeType: validated.mimeType,
        sizeBytes: validated.sizeBytes,
        checksum: validated.checksum,
        storageKey: validated.storageKey,
        userId: request.userId,
        classId: request.classId ?? null,
        folderId: request.folderId ?? null,
      },
    });
  } catch (error) {
    // Never leave bytes behind for a row that does not exist.
    await store.delete(validated.storageKey).catch(() => {});
    throw error;
  }

  await enqueueDocumentProcessing({
    documentId: document.id,
    userId: request.userId,
  });

  return document;
}

/**
 * A user may only file a document into their own class or folder. Without
 * this check, a crafted request could place documents in another account's
 * folder (an IDOR).
 */
async function assertDestinationBelongsToUser(
  request: UploadRequest,
): Promise<void> {
  if (request.classId) {
    const owned = await prisma.class.findFirst({
      where: { id: request.classId, userId: request.userId },
      select: { id: true },
    });
    if (!owned) {
      throw new InvalidDestinationError("That class does not exist.");
    }
  }
  if (request.folderId) {
    const owned = await prisma.folder.findFirst({
      where: { id: request.folderId, userId: request.userId },
      select: { id: true },
    });
    if (!owned) {
      throw new InvalidDestinationError("That folder does not exist.");
    }
  }
}

export { UploadValidationError };
