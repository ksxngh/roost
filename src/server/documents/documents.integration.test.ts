// @vitest-environment node
/**
 * End-to-end pipeline tests: upload → storage → row → parse, against the real
 * test database. The queue is stubbed so the test drives `processDocument`
 * directly and can assert its outcomes deterministically.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@/server/queue/queues", () => ({
  enqueueDocumentProcessing: vi.fn(async () => {}),
}));

const { DocumentKind, DocumentStatus } =
  await import("@/generated/prisma/enums");
const { prisma } = await import("@/server/db");
const { LocalStorage } = await import("@/server/storage/local-storage");
const { processDocument } = await import("@/server/documents/process-document");
const {
  DuplicateDocumentError,
  InvalidDestinationError,
  UploadValidationError,
  uploadDocument,
} = await import("@/server/documents/upload-document");
const { enqueueDocumentProcessing } = await import("@/server/queue/queues");

let root: string;
let store: InstanceType<typeof LocalStorage>;
let userId: string;
let otherUserId: string;

async function createUser(email: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      id: `u_${Math.random().toString(36).slice(2, 10)}`,
      name: "Test",
      email,
    },
  });
  return user.id;
}

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toContain("studyforge_test");
  root = await fs.mkdtemp(path.join(os.tmpdir(), "studyforge-docs-"));
  store = new LocalStorage(root);
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
  vi.mocked(enqueueDocumentProcessing).mockClear();
  await prisma.user.deleteMany();
  userId = await createUser(`owner-${Date.now()}-${Math.random()}@example.com`);
  otherUserId = await createUser(
    `other-${Date.now()}-${Math.random()}@example.com`,
  );
});

const notes = () =>
  Buffer.from("Cell biology notes.\n\nMitochondria make ATP.");

describe("uploadDocument", () => {
  it("stores the file, creates a pending row, and queues processing", async () => {
    const document = await uploadDocument(
      { userId, filename: "Bio Notes.txt", buffer: notes() },
      { store },
    );

    expect(document.status).toBe(DocumentStatus.PENDING);
    expect(document.kind).toBe(DocumentKind.TEXT);
    expect(document.title).toBe("Bio Notes");
    expect(await store.exists(document.storageKey)).toBe(true);
    expect(enqueueDocumentProcessing).toHaveBeenCalledWith({
      documentId: document.id,
      userId,
    });
  });

  it("namespaces the storage key under the owning user", async () => {
    const document = await uploadDocument(
      { userId, filename: "notes.txt", buffer: notes() },
      { store },
    );
    expect(document.storageKey.startsWith(`${userId}/`)).toBe(true);
  });

  it("rejects a duplicate upload of identical bytes", async () => {
    await uploadDocument(
      { userId, filename: "first.txt", buffer: notes() },
      { store },
    );
    await expect(
      uploadDocument(
        { userId, filename: "second.txt", buffer: notes() },
        { store },
      ),
    ).rejects.toBeInstanceOf(DuplicateDocumentError);
  });

  it("allows two users to upload identical content", async () => {
    await uploadDocument(
      { userId, filename: "shared.txt", buffer: notes() },
      { store },
    );
    await expect(
      uploadDocument(
        { userId: otherUserId, filename: "shared.txt", buffer: notes() },
        { store },
      ),
    ).resolves.toBeTruthy();
  });

  it("refuses to file a document into another user's class", async () => {
    const foreignClass = await prisma.class.create({
      data: { name: "Not Yours", userId: otherUserId },
    });
    await expect(
      uploadDocument(
        {
          userId,
          filename: "notes.txt",
          buffer: notes(),
          classId: foreignClass.id,
        },
        { store },
      ),
    ).rejects.toBeInstanceOf(InvalidDestinationError);
  });

  it("refuses to file a document into another user's folder", async () => {
    const foreignFolder = await prisma.folder.create({
      data: { name: "Private", userId: otherUserId },
    });
    await expect(
      uploadDocument(
        {
          userId,
          filename: "notes.txt",
          buffer: notes(),
          folderId: foreignFolder.id,
        },
        { store },
      ),
    ).rejects.toBeInstanceOf(InvalidDestinationError);
  });

  it("accepts the owner's own class and folder", async () => {
    const ownClass = await prisma.class.create({
      data: { name: "Biology 101", userId },
    });
    const ownFolder = await prisma.folder.create({
      data: { name: "Week 1", userId, classId: ownClass.id },
    });
    const document = await uploadDocument(
      {
        userId,
        filename: "notes.txt",
        buffer: notes(),
        classId: ownClass.id,
        folderId: ownFolder.id,
      },
      { store },
    );
    expect(document.classId).toBe(ownClass.id);
    expect(document.folderId).toBe(ownFolder.id);
  });

  it("does not store bytes or queue work when validation fails", async () => {
    await expect(
      uploadDocument(
        { userId, filename: "virus.exe", buffer: Buffer.from("MZ") },
        { store },
      ),
    ).rejects.toBeInstanceOf(UploadValidationError);

    expect(await prisma.document.count()).toBe(0);
    expect(enqueueDocumentProcessing).not.toHaveBeenCalled();
  });

  it("enforces the size limit", async () => {
    await expect(
      uploadDocument(
        { userId, filename: "big.txt", buffer: Buffer.from("x".repeat(5_000)) },
        { store, maxBytes: 1_000 },
      ),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });
});

describe("processDocument", () => {
  it("extracts pages and marks the document ready", async () => {
    const document = await uploadDocument(
      { userId, filename: "Bio.txt", buffer: notes() },
      { store },
    );

    await processDocument(document.id, { store });

    const updated = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
      include: { pages: { orderBy: { pageNumber: "asc" } } },
    });
    expect(updated.status).toBe(DocumentStatus.READY);
    expect(updated.pageCount).toBe(1);
    expect(updated.wordCount).toBeGreaterThan(0);
    expect(updated.processedAt).not.toBeNull();
    expect(updated.processingError).toBeNull();
    expect(updated.pages[0]!.text).toContain("Mitochondria");
  });

  it("is idempotent: reprocessing replaces pages instead of duplicating", async () => {
    const document = await uploadDocument(
      { userId, filename: "Bio.txt", buffer: notes() },
      { store },
    );

    await processDocument(document.id, { store });
    await processDocument(document.id, { store });

    const pages = await prisma.documentPage.count({
      where: { documentId: document.id },
    });
    expect(pages).toBe(1);
  });

  it("records an actionable error and marks the document failed", async () => {
    const document = await uploadDocument(
      { userId, filename: "broken.pdf", buffer: buildFakePdf() },
      { store },
    );

    await expect(processDocument(document.id, { store })).rejects.toBeTruthy();

    const updated = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(updated.status).toBe(DocumentStatus.FAILED);
    expect(updated.processingError).toBeTruthy();
    // The message must be user-facing, not a stack trace or library internal.
    expect(updated.processingError).not.toContain("at ");
  });

  it("reports missing storage objects without leaking internals", async () => {
    const document = await uploadDocument(
      { userId, filename: "Bio.txt", buffer: notes() },
      { store },
    );
    await store.delete(document.storageKey);

    await expect(processDocument(document.id, { store })).rejects.toBeTruthy();

    const updated = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(updated.status).toBe(DocumentStatus.FAILED);
    expect(updated.processingError).toMatch(/upload it again/i);
  });

  it("silently skips a document deleted before processing", async () => {
    const document = await uploadDocument(
      { userId, filename: "Bio.txt", buffer: notes() },
      { store },
    );
    await prisma.document.update({
      where: { id: document.id },
      data: { deletedAt: new Date() },
    });

    await expect(
      processDocument(document.id, { store }),
    ).resolves.toBeUndefined();

    const updated = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(updated.status).toBe(DocumentStatus.PENDING);
  });

  it("skips an unknown document id without throwing", async () => {
    await expect(
      processDocument("does-not-exist", { store }),
    ).resolves.toBeUndefined();
  });

  it("cascades page deletion when the document is removed", async () => {
    const document = await uploadDocument(
      { userId, filename: "Bio.txt", buffer: notes() },
      { store },
    );
    await processDocument(document.id, { store });

    await prisma.document.delete({ where: { id: document.id } });

    expect(
      await prisma.documentPage.count({ where: { documentId: document.id } }),
    ).toBe(0);
  });

  it("cascades document deletion when the user is removed", async () => {
    await uploadDocument(
      { userId, filename: "Bio.txt", buffer: notes() },
      { store },
    );
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.document.count({ where: { userId } })).toBe(0);
  });
});

/** A structurally valid PDF header whose body is unparseable. */
function buildFakePdf(): Buffer {
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n"),
    Buffer.from("garbage that is not a real pdf body"),
  ]);
}
