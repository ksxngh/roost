import type { DocumentStatus } from "@/generated/prisma/enums";
import type { DocumentKind } from "@/generated/prisma/enums";
import type { DocumentFilter } from "@/lib/validations/library";
import { prisma } from "@/server/db";
import { assertOwnedClass } from "@/server/library/classes";
import { NotFoundError } from "@/server/library/errors";
import { assertOwnedFolder } from "@/server/library/folders";
import { storage } from "@/server/storage";

export type DocumentListItem = {
  id: string;
  title: string;
  kind: DocumentKind;
  status: DocumentStatus;
  sizeBytes: number;
  pageCount: number | null;
  wordCount: number | null;
  processingError: string | null;
  favorite: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  classId: string | null;
  folderId: string | null;
  className: string | null;
  tags: { id: string; name: string; color: string }[];
};

export type DocumentPage = {
  items: DocumentListItem[];
  /** Pass back as `cursor` to fetch the next page; null when exhausted. */
  nextCursor: string | null;
};

/**
 * List a user's documents with filtering, search, and cursor pagination.
 *
 * Every query is scoped by `userId` at the data layer, so a caller cannot
 * widen it by passing a foreign id.
 */
export async function listDocuments(
  userId: string,
  filter: DocumentFilter,
): Promise<DocumentPage> {
  const rows = await prisma.document.findMany({
    where: {
      userId,
      deletedAt: filter.deleted ? { not: null } : null,
      ...(filter.deleted
        ? {}
        : { archivedAt: filter.archived ? { not: null } : null }),
      ...(filter.classId ? { classId: filter.classId } : {}),
      ...(filter.folderId ? { folderId: filter.folderId } : {}),
      ...(filter.favorite ? { favorite: true } : {}),
      ...(filter.tagId ? { tags: { some: { tagId: filter.tagId } } } : {}),
      ...(filter.search
        ? { title: { contains: filter.search, mode: "insensitive" } }
        : {}),
    },
    // Stable ordering for cursor pagination: createdAt can tie, id cannot.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: filter.limit + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    include: {
      class: { select: { name: true } },
      tags: { include: { tag: true } },
    },
  });

  const hasMore = rows.length > filter.limit;
  const items = (hasMore ? rows.slice(0, filter.limit) : rows).map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    sizeBytes: row.sizeBytes,
    pageCount: row.pageCount,
    wordCount: row.wordCount,
    processingError: row.processingError,
    favorite: row.favorite,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    classId: row.classId,
    folderId: row.folderId,
    className: row.class?.name ?? null,
    tags: row.tags.map(({ tag }) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
    })),
  }));

  return {
    items,
    nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
  };
}

/** Current status of specific documents — used for lightweight polling. */
export async function getDocumentStatuses(
  userId: string,
  ids: string[],
): Promise<{ id: string; status: DocumentStatus; pageCount: number | null }[]> {
  if (ids.length === 0) return [];
  return prisma.document.findMany({
    where: { userId, id: { in: ids.slice(0, 100) } },
    select: { id: true, status: true, pageCount: true },
  });
}

export async function renameDocument(
  userId: string,
  id: string,
  title: string,
): Promise<void> {
  await assertOwnedDocument(userId, id);
  await prisma.document.update({ where: { id }, data: { title } });
}

export async function setDocumentFavorite(
  userId: string,
  id: string,
  favorite: boolean,
): Promise<void> {
  await assertOwnedDocument(userId, id);
  await prisma.document.update({ where: { id }, data: { favorite } });
}

export async function setDocumentArchived(
  userId: string,
  id: string,
  archived: boolean,
): Promise<void> {
  await assertOwnedDocument(userId, id);
  await prisma.document.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
  });
}

export async function moveDocument(
  userId: string,
  id: string,
  destination: { classId?: string | null; folderId?: string | null },
): Promise<void> {
  await assertOwnedDocument(userId, id);
  if (destination.classId) {
    await assertOwnedClass(userId, destination.classId);
  }
  if (destination.folderId) {
    await assertOwnedFolder(userId, destination.folderId);
  }
  await prisma.document.update({
    where: { id },
    data: {
      ...(destination.classId !== undefined
        ? { classId: destination.classId }
        : {}),
      ...(destination.folderId !== undefined
        ? { folderId: destination.folderId }
        : {}),
    },
  });
}

/** Soft delete: recoverable from the trash until purged. */
export async function trashDocument(userId: string, id: string): Promise<void> {
  await assertOwnedDocument(userId, id);
  await prisma.document.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function restoreDocument(
  userId: string,
  id: string,
): Promise<void> {
  await assertOwnedDocument(userId, id);
  await prisma.document.update({ where: { id }, data: { deletedAt: null } });
}

/**
 * Permanently delete a document and its stored bytes.
 *
 * The row is removed first; if object deletion then fails the orphaned object
 * is logged rather than thrown, because the user's intent — removing the
 * document from their library — has already succeeded.
 */
export async function purgeDocument(userId: string, id: string): Promise<void> {
  const document = await prisma.document.findFirst({
    where: { id, userId },
    select: { id: true, storageKey: true },
  });
  if (!document) {
    throw new NotFoundError("document");
  }

  await prisma.document.delete({ where: { id } });
  try {
    await storage().delete(document.storageKey);
  } catch (error) {
    console.error(
      `[library] orphaned stored object ${document.storageKey}:`,
      error,
    );
  }
}

/** Full document with extracted pages, for the detail view. */
export async function getDocumentDetail(userId: string, id: string) {
  const document = await prisma.document.findFirst({
    where: { id, userId, deletedAt: null },
    include: {
      pages: { orderBy: { pageNumber: "asc" } },
      class: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
      tags: { include: { tag: true } },
    },
  });
  if (!document) {
    throw new NotFoundError("document");
  }
  return document;
}

export async function assertOwnedDocument(
  userId: string,
  id: string,
): Promise<void> {
  const owned = await prisma.document.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new NotFoundError("document");
  }
}
