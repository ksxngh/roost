// @vitest-environment node
/**
 * Library service tests against the real test database.
 *
 * The recurring theme is ownership: every mutation must refuse to touch
 * another user's records, and every query must be scoped. Those cases matter
 * more than the happy paths, because a miss there is a data breach.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DocumentKind, DocumentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import {
  createClass,
  deleteClass,
  listClasses,
  renameClass,
  setClassArchived,
} from "@/server/library/classes";
import {
  getDocumentStatuses,
  listDocuments,
  moveDocument,
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
  folderPath,
  listFolders,
  moveFolder,
} from "@/server/library/folders";
import {
  createTag,
  listTags,
  tagDocument,
  untagDocument,
} from "@/server/library/tags";

let owner: string;
let stranger: string;

const baseFilter = { archived: false, deleted: false, limit: 50 } as const;

async function createUser(label: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      id: `u_${label}_${Math.random().toString(36).slice(2, 8)}`,
      name: label,
      email: `${label}-${Date.now()}-${Math.random()}@example.com`,
    },
  });
  return user.id;
}

let checksum = 0;
async function seedDocument(
  userId: string,
  overrides: Partial<{
    title: string;
    status: DocumentStatus;
    classId: string | null;
    folderId: string | null;
    favorite: boolean;
    archivedAt: Date | null;
    deletedAt: Date | null;
  }> = {},
) {
  checksum += 1;
  return prisma.document.create({
    data: {
      title: overrides.title ?? "Notes",
      kind: DocumentKind.TEXT,
      status: overrides.status ?? DocumentStatus.READY,
      storageKey: `${userId}/${checksum}-${Math.random()}.txt`,
      mimeType: "text/plain",
      sizeBytes: 100,
      checksum: `sum-${userId}-${checksum}`,
      userId,
      classId: overrides.classId ?? null,
      folderId: overrides.folderId ?? null,
      favorite: overrides.favorite ?? false,
      archivedAt: overrides.archivedAt ?? null,
      deletedAt: overrides.deletedAt ?? null,
    },
  });
}

beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("studyforge_test");
});

beforeEach(async () => {
  await prisma.user.deleteMany();
  owner = await createUser("owner");
  stranger = await createUser("stranger");
});

describe("classes", () => {
  it("creates and lists classes with document counts", async () => {
    const biology = await createClass(owner, {
      name: "Biology",
      color: "chart-1",
    });
    await seedDocument(owner, { classId: biology.id });
    await seedDocument(owner, { classId: biology.id });

    const classes = await listClasses(owner);
    expect(classes).toHaveLength(1);
    expect(classes[0]!.documentCount).toBe(2);
  });

  it("excludes deleted documents from counts", async () => {
    const klass = await createClass(owner, { name: "Chem", color: "chart-1" });
    await seedDocument(owner, { classId: klass.id });
    await seedDocument(owner, { classId: klass.id, deletedAt: new Date() });

    const [summary] = await listClasses(owner);
    expect(summary!.documentCount).toBe(1);
  });

  it("rejects a duplicate class name for the same user", async () => {
    await createClass(owner, { name: "Biology", color: "chart-1" });
    await expect(
      createClass(owner, { name: "Biology", color: "chart-2" }),
    ).rejects.toBeInstanceOf(DuplicateNameError);
  });

  it("allows two users to use the same class name", async () => {
    await createClass(owner, { name: "Biology", color: "chart-1" });
    await expect(
      createClass(stranger, { name: "Biology", color: "chart-1" }),
    ).resolves.toBeTruthy();
  });

  it("never lists another user's classes", async () => {
    await createClass(stranger, { name: "Private", color: "chart-1" });
    expect(await listClasses(owner)).toHaveLength(0);
  });

  it("refuses to rename another user's class", async () => {
    const foreign = await createClass(stranger, {
      name: "Theirs",
      color: "chart-1",
    });
    await expect(renameClass(owner, foreign.id, "Mine")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const unchanged = await prisma.class.findUniqueOrThrow({
      where: { id: foreign.id },
    });
    expect(unchanged.name).toBe("Theirs");
  });

  it("refuses to delete another user's class", async () => {
    const foreign = await createClass(stranger, {
      name: "Theirs",
      color: "chart-1",
    });
    await expect(deleteClass(owner, foreign.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await prisma.class.count({ where: { id: foreign.id } })).toBe(1);
  });

  it("hides archived classes unless requested", async () => {
    const klass = await createClass(owner, { name: "Old", color: "chart-1" });
    await setClassArchived(owner, klass.id, true);

    expect(await listClasses(owner)).toHaveLength(0);
    expect(await listClasses(owner, { includeArchived: true })).toHaveLength(1);
  });

  it("detaches documents rather than deleting them when a class is removed", async () => {
    const klass = await createClass(owner, { name: "Temp", color: "chart-1" });
    const document = await seedDocument(owner, { classId: klass.id });

    await deleteClass(owner, klass.id);

    const survivor = await prisma.document.findUnique({
      where: { id: document.id },
    });
    expect(survivor).not.toBeNull();
    expect(survivor!.classId).toBeNull();
  });
});

describe("folders", () => {
  it("creates nested folders and resolves a breadcrumb path", async () => {
    const root = await createFolder(owner, { name: "Semester 1" });
    const child = await createFolder(owner, {
      name: "Week 1",
      parentId: root.id,
    });
    const grandchild = await createFolder(owner, {
      name: "Lecture",
      parentId: child.id,
    });

    const path = await folderPath(owner, grandchild.id);
    expect(path.map((crumb) => crumb.name)).toEqual([
      "Semester 1",
      "Week 1",
      "Lecture",
    ]);
  });

  it("lists only folders at the requested level", async () => {
    const root = await createFolder(owner, { name: "Root" });
    await createFolder(owner, { name: "Child", parentId: root.id });

    const topLevel = await listFolders(owner, { parentId: null });
    expect(topLevel.map((folder) => folder.name)).toEqual(["Root"]);
  });

  it("refuses to create a folder inside another user's folder", async () => {
    const foreign = await createFolder(stranger, { name: "Theirs" });
    await expect(
      createFolder(owner, { name: "Mine", parentId: foreign.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to move a folder into itself", async () => {
    const folder = await createFolder(owner, { name: "Self" });
    await expect(
      moveFolder(owner, folder.id, { parentId: folder.id }),
    ).rejects.toBeInstanceOf(InvalidMoveError);
  });

  it("refuses to move a folder into its own descendant", async () => {
    const root = await createFolder(owner, { name: "Root" });
    const child = await createFolder(owner, {
      name: "Child",
      parentId: root.id,
    });
    const grandchild = await createFolder(owner, {
      name: "Grandchild",
      parentId: child.id,
    });

    await expect(
      moveFolder(owner, root.id, { parentId: grandchild.id }),
    ).rejects.toBeInstanceOf(InvalidMoveError);
  });

  it("allows a legitimate move to a sibling subtree", async () => {
    const a = await createFolder(owner, { name: "A" });
    const b = await createFolder(owner, { name: "B" });
    const child = await createFolder(owner, { name: "Child", parentId: a.id });

    const moved = await moveFolder(owner, child.id, { parentId: b.id });
    expect(moved.parentId).toBe(b.id);
  });

  it("cascades subfolders but detaches documents on delete", async () => {
    const root = await createFolder(owner, { name: "Root" });
    const child = await createFolder(owner, {
      name: "Child",
      parentId: root.id,
    });
    const document = await seedDocument(owner, { folderId: child.id });

    await prisma.folder.delete({ where: { id: root.id } });

    expect(await prisma.folder.count({ where: { id: child.id } })).toBe(0);
    const survivor = await prisma.document.findUnique({
      where: { id: document.id },
    });
    expect(survivor).not.toBeNull();
    expect(survivor!.folderId).toBeNull();
  });
});

describe("listDocuments", () => {
  it("returns only the caller's documents", async () => {
    await seedDocument(owner, { title: "Mine" });
    await seedDocument(stranger, { title: "Theirs" });

    const page = await listDocuments(owner, baseFilter);
    expect(page.items.map((item) => item.title)).toEqual(["Mine"]);
  });

  it("hides archived and deleted documents by default", async () => {
    await seedDocument(owner, { title: "Active" });
    await seedDocument(owner, { title: "Archived", archivedAt: new Date() });
    await seedDocument(owner, { title: "Trashed", deletedAt: new Date() });

    const page = await listDocuments(owner, baseFilter);
    expect(page.items.map((item) => item.title)).toEqual(["Active"]);
  });

  it("shows archived documents when requested", async () => {
    await seedDocument(owner, { title: "Active" });
    await seedDocument(owner, { title: "Archived", archivedAt: new Date() });

    const page = await listDocuments(owner, { ...baseFilter, archived: true });
    expect(page.items.map((item) => item.title)).toEqual(["Archived"]);
  });

  it("shows trashed documents in the deleted view, including archived ones", async () => {
    await seedDocument(owner, { title: "Active" });
    await seedDocument(owner, {
      title: "Trashed",
      deletedAt: new Date(),
      archivedAt: new Date(),
    });

    const page = await listDocuments(owner, { ...baseFilter, deleted: true });
    expect(page.items.map((item) => item.title)).toEqual(["Trashed"]);
  });

  it("filters by favorite", async () => {
    await seedDocument(owner, { title: "Plain" });
    await seedDocument(owner, { title: "Starred", favorite: true });

    const page = await listDocuments(owner, { ...baseFilter, favorite: true });
    expect(page.items.map((item) => item.title)).toEqual(["Starred"]);
  });

  it("searches titles case-insensitively", async () => {
    await seedDocument(owner, { title: "Photosynthesis Notes" });
    await seedDocument(owner, { title: "Kinematics" });

    const page = await listDocuments(owner, {
      ...baseFilter,
      search: "photosynth",
    });
    expect(page.items.map((item) => item.title)).toEqual([
      "Photosynthesis Notes",
    ]);
  });

  it("never leaks another user's documents through search", async () => {
    await seedDocument(stranger, { title: "Secret Plans" });
    const page = await listDocuments(owner, {
      ...baseFilter,
      search: "Secret",
    });
    expect(page.items).toHaveLength(0);
  });

  it("paginates with a stable cursor and no duplicates", async () => {
    for (let i = 0; i < 7; i += 1) {
      await seedDocument(owner, { title: `Doc ${i}` });
    }

    const first = await listDocuments(owner, { ...baseFilter, limit: 3 });
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).toBeTruthy();

    const second = await listDocuments(owner, {
      ...baseFilter,
      limit: 3,
      cursor: first.nextCursor!,
    });
    const overlap = first.items.filter((item) =>
      second.items.some((other) => other.id === item.id),
    );
    expect(overlap).toHaveLength(0);
  });

  it("reports no cursor on the final page", async () => {
    await seedDocument(owner, { title: "Only" });
    const page = await listDocuments(owner, { ...baseFilter, limit: 10 });
    expect(page.nextCursor).toBeNull();
  });

  it("includes class name and tags", async () => {
    const klass = await createClass(owner, {
      name: "Biology",
      color: "chart-1",
    });
    const tag = await createTag(owner, { name: "exam", color: "chart-2" });
    const document = await seedDocument(owner, { classId: klass.id });
    await tagDocument(owner, document.id, tag.id);

    const page = await listDocuments(owner, baseFilter);
    expect(page.items[0]!.className).toBe("Biology");
    expect(page.items[0]!.tags.map((t) => t.name)).toEqual(["exam"]);
  });
});

describe("document mutations", () => {
  it("renames, favorites, and archives", async () => {
    const document = await seedDocument(owner, { title: "Before" });

    await renameDocument(owner, document.id, "After");
    await setDocumentFavorite(owner, document.id, true);
    await setDocumentArchived(owner, document.id, true);

    const updated = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(updated.title).toBe("After");
    expect(updated.favorite).toBe(true);
    expect(updated.archivedAt).not.toBeNull();
  });

  it("round-trips trash and restore", async () => {
    const document = await seedDocument(owner);

    await trashDocument(owner, document.id);
    expect((await listDocuments(owner, baseFilter)).items).toHaveLength(0);

    await restoreDocument(owner, document.id);
    expect((await listDocuments(owner, baseFilter)).items).toHaveLength(1);
  });

  it.each([
    ["rename", (id: string) => renameDocument(owner, id, "Hacked")],
    ["favorite", (id: string) => setDocumentFavorite(owner, id, true)],
    ["archive", (id: string) => setDocumentArchived(owner, id, true)],
    ["trash", (id: string) => trashDocument(owner, id)],
  ])("refuses to %s another user's document", async (_label, mutate) => {
    const foreign = await seedDocument(stranger, { title: "Theirs" });
    await expect(mutate(foreign.id)).rejects.toBeInstanceOf(NotFoundError);

    const unchanged = await prisma.document.findUniqueOrThrow({
      where: { id: foreign.id },
    });
    expect(unchanged.title).toBe("Theirs");
    expect(unchanged.favorite).toBe(false);
    expect(unchanged.deletedAt).toBeNull();
  });

  it("refuses to move a document into another user's class", async () => {
    const document = await seedDocument(owner);
    const foreignClass = await createClass(stranger, {
      name: "Theirs",
      color: "chart-1",
    });

    await expect(
      moveDocument(owner, document.id, { classId: foreignClass.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("moves a document into the owner's own folder", async () => {
    const document = await seedDocument(owner);
    const folder = await createFolder(owner, { name: "Week 1" });

    await moveDocument(owner, document.id, { folderId: folder.id });

    const updated = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(updated.folderId).toBe(folder.id);
  });
});

describe("getDocumentStatuses", () => {
  it("returns statuses for the caller's documents only", async () => {
    const mine = await seedDocument(owner, {
      status: DocumentStatus.PROCESSING,
    });
    const theirs = await seedDocument(stranger);

    const statuses = await getDocumentStatuses(owner, [mine.id, theirs.id]);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]!.id).toBe(mine.id);
    expect(statuses[0]!.status).toBe(DocumentStatus.PROCESSING);
  });

  it("returns an empty array for no ids", async () => {
    expect(await getDocumentStatuses(owner, [])).toEqual([]);
  });
});

describe("tags", () => {
  it("attaches and detaches tags idempotently", async () => {
    const tag = await createTag(owner, { name: "midterm", color: "chart-2" });
    const document = await seedDocument(owner);

    await tagDocument(owner, document.id, tag.id);
    await tagDocument(owner, document.id, tag.id);

    expect(
      await prisma.documentTag.count({ where: { documentId: document.id } }),
    ).toBe(1);

    await untagDocument(owner, document.id, tag.id);
    expect(
      await prisma.documentTag.count({ where: { documentId: document.id } }),
    ).toBe(0);
  });

  it("refuses to apply another user's tag", async () => {
    const foreignTag = await createTag(stranger, {
      name: "theirs",
      color: "chart-2",
    });
    const document = await seedDocument(owner);

    await expect(
      tagDocument(owner, document.id, foreignTag.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to tag another user's document", async () => {
    const tag = await createTag(owner, { name: "mine", color: "chart-2" });
    const foreignDocument = await seedDocument(stranger);

    await expect(
      tagDocument(owner, foreignDocument.id, tag.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("counts only live documents per tag", async () => {
    const tag = await createTag(owner, { name: "exam", color: "chart-2" });
    const live = await seedDocument(owner);
    const trashed = await seedDocument(owner, { deletedAt: new Date() });
    await tagDocument(owner, live.id, tag.id);
    await tagDocument(owner, trashed.id, tag.id);

    const [summary] = await listTags(owner);
    expect(summary!.documentCount).toBe(1);
  });
});
