import type { TagModel } from "@/generated/prisma/models";
import type { ColorToken } from "@/lib/validations/library";
import { prisma } from "@/server/db";
import { assertOwnedDocument } from "@/server/library/documents";
import { DuplicateNameError, NotFoundError } from "@/server/library/errors";

export type TagSummary = TagModel & { documentCount: number };

export async function listTags(userId: string): Promise<TagSummary[]> {
  const tags = await prisma.tag.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { documents: { where: { document: { deletedAt: null } } } },
      },
    },
  });
  return tags.map(({ _count, ...rest }) => ({
    ...rest,
    documentCount: _count.documents,
  }));
}

export async function createTag(
  userId: string,
  input: { name: string; color: ColorToken },
): Promise<TagModel> {
  try {
    return await prisma.tag.create({
      data: { userId, name: input.name, color: input.color },
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      throw new DuplicateNameError("tag", input.name);
    }
    throw error;
  }
}

export async function deleteTag(userId: string, id: string): Promise<void> {
  await assertOwnedTag(userId, id);
  await prisma.tag.delete({ where: { id } });
}

/** Attach a tag to a document; both must belong to the user. */
export async function tagDocument(
  userId: string,
  documentId: string,
  tagId: string,
): Promise<void> {
  await assertOwnedDocument(userId, documentId);
  await assertOwnedTag(userId, tagId);
  await prisma.documentTag.upsert({
    where: { documentId_tagId: { documentId, tagId } },
    create: { documentId, tagId },
    update: {},
  });
}

export async function untagDocument(
  userId: string,
  documentId: string,
  tagId: string,
): Promise<void> {
  await assertOwnedDocument(userId, documentId);
  await assertOwnedTag(userId, tagId);
  await prisma.documentTag.deleteMany({ where: { documentId, tagId } });
}

export async function assertOwnedTag(
  userId: string,
  id: string,
): Promise<void> {
  const owned = await prisma.tag.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new NotFoundError("tag");
  }
}
