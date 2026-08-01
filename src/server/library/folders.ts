import type { FolderModel } from "@/generated/prisma/models";
import { prisma } from "@/server/db";
import { assertOwnedClass } from "@/server/library/classes";
import { InvalidMoveError, NotFoundError } from "@/server/library/errors";

export type FolderSummary = FolderModel & { documentCount: number };

export type Breadcrumb = { id: string; name: string };

/** Folders directly inside a class (or at the library root when null). */
export async function listFolders(
  userId: string,
  { classId, parentId }: { classId?: string | null; parentId?: string | null },
): Promise<FolderSummary[]> {
  const folders = await prisma.folder.findMany({
    where: {
      userId,
      ...(classId !== undefined ? { classId } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { documents: { where: { deletedAt: null } } } },
    },
  });
  return folders.map(({ _count, ...rest }) => ({
    ...rest,
    documentCount: _count.documents,
  }));
}

export async function createFolder(
  userId: string,
  input: { name: string; classId?: string | null; parentId?: string | null },
): Promise<FolderModel> {
  if (input.classId) {
    await assertOwnedClass(userId, input.classId);
  }
  if (input.parentId) {
    await assertOwnedFolder(userId, input.parentId);
  }
  return prisma.folder.create({
    data: {
      userId,
      name: input.name,
      classId: input.classId ?? null,
      parentId: input.parentId ?? null,
    },
  });
}

export async function renameFolder(
  userId: string,
  id: string,
  name: string,
): Promise<FolderModel> {
  await assertOwnedFolder(userId, id);
  return prisma.folder.update({ where: { id }, data: { name } });
}

/**
 * Move a folder to a new parent and/or class.
 *
 * Refuses to move a folder into itself or into one of its own descendants —
 * that would detach the whole subtree from the tree and make it unreachable.
 */
export async function moveFolder(
  userId: string,
  id: string,
  destination: { parentId?: string | null; classId?: string | null },
): Promise<FolderModel> {
  await assertOwnedFolder(userId, id);

  if (destination.parentId) {
    if (destination.parentId === id) {
      throw new InvalidMoveError("A folder cannot be moved into itself.");
    }
    await assertOwnedFolder(userId, destination.parentId);
    const ancestors = await ancestorIds(userId, destination.parentId);
    if (ancestors.includes(id)) {
      throw new InvalidMoveError(
        "A folder cannot be moved into one of its own subfolders.",
      );
    }
  }
  if (destination.classId) {
    await assertOwnedClass(userId, destination.classId);
  }

  return prisma.folder.update({
    where: { id },
    data: {
      ...(destination.parentId !== undefined
        ? { parentId: destination.parentId }
        : {}),
      ...(destination.classId !== undefined
        ? { classId: destination.classId }
        : {}),
    },
  });
}

/** Delete a folder; subfolders cascade, documents are detached. */
export async function deleteFolder(userId: string, id: string): Promise<void> {
  await assertOwnedFolder(userId, id);
  await prisma.folder.delete({ where: { id } });
}

/** Path from the root down to the given folder, for breadcrumbs. */
export async function folderPath(
  userId: string,
  id: string,
): Promise<Breadcrumb[]> {
  const path: Breadcrumb[] = [];
  let current: string | null = id;
  // Bounded so a cycle introduced by a bug cannot hang the request.
  for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
    const folder: { id: string; name: string; parentId: string | null } | null =
      await prisma.folder.findFirst({
        where: { id: current, userId },
        select: { id: true, name: true, parentId: true },
      });
    if (!folder) break;
    path.unshift({ id: folder.id, name: folder.name });
    current = folder.parentId;
  }
  return path;
}

const MAX_DEPTH = 32;

/** Ids of every ancestor of a folder, nearest first. */
async function ancestorIds(userId: string, id: string): Promise<string[]> {
  const ids: string[] = [];
  let current: string | null = id;
  for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
    const folder: { id: string; parentId: string | null } | null =
      await prisma.folder.findFirst({
        where: { id: current, userId },
        select: { id: true, parentId: true },
      });
    if (!folder) break;
    ids.push(folder.id);
    current = folder.parentId;
  }
  return ids;
}

export async function assertOwnedFolder(
  userId: string,
  id: string,
): Promise<void> {
  const owned = await prisma.folder.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new NotFoundError("folder");
  }
}
