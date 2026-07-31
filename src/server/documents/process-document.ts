import { DocumentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import { ParseError, parseDocument } from "@/server/parsing";
import { ObjectNotFoundError, storage, type Storage } from "@/server/storage";

/**
 * Extract text for one document and record the outcome.
 *
 * Runs inside a queue worker, never in a request. Written to be idempotent:
 * a retried job re-parses and replaces pages rather than appending, so a
 * partially completed run cannot leave duplicated text behind.
 */
export async function processDocument(
  documentId: string,
  deps: { store?: Storage } = {},
): Promise<void> {
  const store = deps.store ?? storage();

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, kind: true, storageKey: true, deletedAt: true },
  });

  if (!document || document.deletedAt) {
    // Deleted between upload and processing: nothing to do, and failing the
    // job would only produce noise.
    return;
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { status: DocumentStatus.PROCESSING, processingError: null },
  });

  try {
    const buffer = await store.get(document.storageKey);
    const parsed = await parseDocument(document.kind, buffer);

    await prisma.$transaction([
      prisma.documentPage.deleteMany({ where: { documentId } }),
      prisma.documentPage.createMany({
        data: parsed.pages.map((page) => ({
          documentId,
          pageNumber: page.pageNumber,
          text: page.text,
        })),
      }),
      prisma.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.READY,
          pageCount: parsed.pageCount,
          wordCount: parsed.wordCount,
          processedAt: new Date(),
          processingError: null,
        },
      }),
    ]);
  } catch (error) {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.FAILED,
        processingError: describeFailure(error),
        processedAt: new Date(),
      },
    });
    throw error;
  }
}

/**
 * Turn an exception into something a student can act on. Internal details
 * (stack traces, library messages) never reach the UI.
 */
function describeFailure(error: unknown): string {
  if (error instanceof ParseError) {
    return error.message;
  }
  if (error instanceof ObjectNotFoundError) {
    return "The uploaded file could not be found in storage. Please upload it again.";
  }
  return "Something went wrong while reading this file. Please try uploading it again.";
}
