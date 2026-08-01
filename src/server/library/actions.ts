"use server";

import { revalidatePath } from "next/cache";

import {
  createClassSchema,
  createFolderSchema,
  createTagSchema,
  moveDocumentSchema,
  moveFolderSchema,
  renameSchema,
} from "@/lib/validations/library";
import {
  createClass,
  deleteClass,
  renameClass,
  setClassArchived,
} from "@/server/library/classes";
import {
  moveDocument,
  purgeDocument,
  renameDocument,
  restoreDocument,
  setDocumentArchived,
  setDocumentFavorite,
  trashDocument,
} from "@/server/library/documents";
import {
  DuplicateNameError,
  InvalidMoveError,
  NotFoundError,
} from "@/server/library/errors";
import {
  createFolder,
  deleteFolder,
  moveFolder,
  renameFolder,
} from "@/server/library/folders";
import {
  createTag,
  deleteTag,
  tagDocument,
  untagDocument,
} from "@/server/library/tags";
import { requireSession } from "@/server/session";

export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? Record<never, never> : { data: T }))
  | { ok: false; error: string };

/**
 * Wrap a mutation so every action shares the same contract: authenticate,
 * run, revalidate, and convert known domain errors into messages safe to show
 * a user. Unexpected errors are logged and replaced with a generic message so
 * internals never reach the client.
 */
async function mutation<T>(
  run: (userId: string) => Promise<T>,
): Promise<ActionResult<T>> {
  const { user } = await requireSession();
  try {
    const data = await run(user.id);
    revalidatePath("/library");
    return { ok: true, data } as ActionResult<T>;
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof DuplicateNameError ||
      error instanceof InvalidMoveError
    ) {
      return { ok: false, error: error.message };
    }
    console.error("[library action] unexpected failure:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function invalid(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

// ── Classes ────────────────────────────────────────────────────────────────

export async function createClassAction(input: unknown) {
  const parsed = createClassSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return mutation((userId) => createClass(userId, parsed.data));
}

export async function renameClassAction(input: unknown) {
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return mutation((userId) =>
    renameClass(userId, parsed.data.id, parsed.data.name),
  );
}

export async function archiveClassAction(id: string, archived: boolean) {
  return mutation((userId) => setClassArchived(userId, id, archived));
}

export async function deleteClassAction(id: string) {
  return mutation((userId) => deleteClass(userId, id));
}

// ── Folders ────────────────────────────────────────────────────────────────

export async function createFolderAction(input: unknown) {
  const parsed = createFolderSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return mutation((userId) => createFolder(userId, parsed.data));
}

export async function renameFolderAction(input: unknown) {
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return mutation((userId) =>
    renameFolder(userId, parsed.data.id, parsed.data.name),
  );
}

export async function moveFolderAction(input: unknown) {
  const parsed = moveFolderSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  const { id, ...destination } = parsed.data;
  return mutation((userId) => moveFolder(userId, id, destination));
}

export async function deleteFolderAction(id: string) {
  return mutation((userId) => deleteFolder(userId, id));
}

// ── Documents ──────────────────────────────────────────────────────────────

export async function renameDocumentAction(input: unknown) {
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return mutation((userId) =>
    renameDocument(userId, parsed.data.id, parsed.data.name),
  );
}

export async function favoriteDocumentAction(id: string, favorite: boolean) {
  return mutation((userId) => setDocumentFavorite(userId, id, favorite));
}

export async function archiveDocumentAction(id: string, archived: boolean) {
  return mutation((userId) => setDocumentArchived(userId, id, archived));
}

export async function moveDocumentAction(input: unknown) {
  const parsed = moveDocumentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  const { id, ...destination } = parsed.data;
  return mutation((userId) => moveDocument(userId, id, destination));
}

export async function trashDocumentAction(id: string) {
  return mutation((userId) => trashDocument(userId, id));
}

export async function restoreDocumentAction(id: string) {
  return mutation((userId) => restoreDocument(userId, id));
}

export async function purgeDocumentAction(id: string) {
  return mutation((userId) => purgeDocument(userId, id));
}

// ── Tags ───────────────────────────────────────────────────────────────────

export async function createTagAction(input: unknown) {
  const parsed = createTagSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return mutation((userId) => createTag(userId, parsed.data));
}

export async function deleteTagAction(id: string) {
  return mutation((userId) => deleteTag(userId, id));
}

export async function tagDocumentAction(documentId: string, tagId: string) {
  return mutation((userId) => tagDocument(userId, documentId, tagId));
}

export async function untagDocumentAction(documentId: string, tagId: string) {
  return mutation((userId) => untagDocument(userId, documentId, tagId));
}
