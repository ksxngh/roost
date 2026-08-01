import type { ClassModel } from "@/generated/prisma/models";
import type { ColorToken } from "@/lib/validations/library";
import { prisma } from "@/server/db";
import { DuplicateNameError, NotFoundError } from "@/server/library/errors";

export type ClassSummary = ClassModel & { documentCount: number };

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === "P2002";
}

/** Classes owned by the user, with their document counts. */
export async function listClasses(
  userId: string,
  { includeArchived = false } = {},
): Promise<ClassSummary[]> {
  const classes = await prisma.class.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { documents: { where: { deletedAt: null } } } },
    },
  });
  return classes.map(({ _count, ...rest }) => ({
    ...rest,
    documentCount: _count.documents,
  }));
}

export async function createClass(
  userId: string,
  input: { name: string; color: ColorToken },
): Promise<ClassModel> {
  try {
    return await prisma.class.create({
      data: { userId, name: input.name, color: input.color },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateNameError("class", input.name);
    }
    throw error;
  }
}

export async function renameClass(
  userId: string,
  id: string,
  name: string,
): Promise<ClassModel> {
  await assertOwnedClass(userId, id);
  try {
    return await prisma.class.update({ where: { id }, data: { name } });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateNameError("class", name);
    }
    throw error;
  }
}

export async function setClassArchived(
  userId: string,
  id: string,
  archived: boolean,
): Promise<ClassModel> {
  await assertOwnedClass(userId, id);
  return prisma.class.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
  });
}

/**
 * Delete a class. Its folders cascade away, but documents are only detached
 * (`onDelete: SetNull`) so tidying up the library never destroys uploads.
 */
export async function deleteClass(userId: string, id: string): Promise<void> {
  await assertOwnedClass(userId, id);
  await prisma.class.delete({ where: { id } });
}

/** Throws NotFoundError unless the class exists and belongs to the user. */
export async function assertOwnedClass(
  userId: string,
  id: string,
): Promise<void> {
  const owned = await prisma.class.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new NotFoundError("class");
  }
}
