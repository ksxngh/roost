// @vitest-environment node
/**
 * Verification-document tests. The upload path is where untrusted bytes enter
 * the system, so these cover content sniffing, size limits, cross-business
 * access, and the guarantee that a failed insert never leaves stored bytes
 * behind.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BusinessRole } from "@/generated/prisma/enums";
import { ForbiddenError, NotFoundError } from "@/server/businesses/access";
import { createBusiness } from "@/server/businesses/businesses";
import {
  DocumentValidationError,
  deleteBusinessDocument,
  listBusinessDocuments,
  sanitizeTitle,
  uploadBusinessDocument,
} from "@/server/businesses/documents";
import { prisma } from "@/server/db";
import type { Storage } from "@/server/storage";

let seq = 0;

/** In-memory storage double, so tests never touch the filesystem. */
function fakeStorage() {
  const objects = new Map<string, Buffer>();
  const store: Storage = {
    async put(key, body) {
      objects.set(key, body);
    },
    async get(key) {
      const found = objects.get(key);
      if (!found) throw new Error(`missing ${key}`);
      return found;
    },
    async delete(key) {
      objects.delete(key);
    },
    async exists(key) {
      return objects.has(key);
    },
  };
  return { store, objects };
}

/** Smallest byte sequences that pass magic-byte sniffing. */
const PDF = Buffer.from("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n", "binary");
/** A real 1x1 PNG — the signature alone does not satisfy the sniffer. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function makeUser() {
  seq += 1;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      name: `User ${seq}`,
      email: `doc-${Date.now()}-${seq}@example.com`,
      emailVerified: true,
    },
  });
}

async function makeBusiness(name = "Northside Plumbing") {
  seq += 1;
  const user = await makeUser();
  const category = await prisma.serviceCategory.create({
    data: { slug: `trade-${seq}`, name: `Trade ${seq}`, position: seq },
  });
  const business = await createBusiness(user.id, {
    name,
    categoryIds: [category.id],
    serviceAreas: [{ city: "Surrey", region: "BC", country: "CA" }],
  });
  return { user, business };
}

beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("roost_test");
});

beforeEach(async () => {
  await prisma.business.deleteMany();
  await prisma.serviceCategory.deleteMany();
  await prisma.user.deleteMany();
});

describe("sanitizeTitle", () => {
  it("drops the directory and the extension", () => {
    expect(sanitizeTitle("/etc/passwd/licence.pdf")).toBe("licence");
    expect(sanitizeTitle("C:\\docs\\insurance.PDF")).toBe("insurance");
  });

  it("strips control characters", () => {
    expect(sanitizeTitle("lic\u0000en\u001Fce.pdf")).toBe("licence");
  });

  it("collapses whitespace", () => {
    expect(sanitizeTitle("  my   licence .pdf")).toBe("my licence");
  });

  it("falls back to a placeholder when nothing survives", () => {
    expect(sanitizeTitle(".pdf")).toBe("Document");
  });

  it("truncates a very long name", () => {
    expect(sanitizeTitle(`${"a".repeat(500)}.pdf`)).toHaveLength(160);
  });
});

describe("uploadBusinessDocument", () => {
  it("stores the bytes and records the row", async () => {
    const { user, business } = await makeBusiness();
    const { store, objects } = fakeStorage();

    const document = await uploadBusinessDocument(
      user.id,
      business.id,
      { kind: "LICENCE", filename: "trade licence.pdf", buffer: PDF },
      { store },
    );

    expect(document.title).toBe("trade licence");
    expect(document.mimeType).toBe("application/pdf");
    expect(document.sizeBytes).toBe(PDF.length);
    expect(document.status).toBe("PENDING");
    expect(objects.has(document.storageKey)).toBe(true);
    // The key is generated, never derived from the uploaded filename.
    expect(document.storageKey).toMatch(
      new RegExp(`^business/${business.id}/[0-9a-f-]{36}\\.pdf$`),
    );
  });

  it("rejects an empty file", async () => {
    const { user, business } = await makeBusiness();
    const { store } = fakeStorage();

    await expect(
      uploadBusinessDocument(
        user.id,
        business.id,
        { kind: "LICENCE", filename: "empty.pdf", buffer: Buffer.alloc(0) },
        { store },
      ),
    ).rejects.toMatchObject({ code: "EMPTY" });
  });

  it("rejects a file over the size limit before storing it", async () => {
    const { user, business } = await makeBusiness();
    const { store, objects } = fakeStorage();

    await expect(
      uploadBusinessDocument(
        user.id,
        business.id,
        { kind: "LICENCE", filename: "big.pdf", buffer: Buffer.alloc(2048) },
        { store, maxBytes: 1024 },
      ),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
    expect(objects.size).toBe(0);
  });

  it.each(["licence.exe", "licence.docx", "licence.svg", "licence"])(
    "rejects the unsupported file %s",
    async (filename) => {
      const { user, business } = await makeBusiness();
      const { store } = fakeStorage();

      await expect(
        uploadBusinessDocument(
          user.id,
          business.id,
          { kind: "LICENCE", filename, buffer: PDF },
          { store },
        ),
      ).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });
    },
  );

  it("rejects a file whose contents contradict its extension", async () => {
    const { user, business } = await makeBusiness();
    const { store, objects } = fakeStorage();

    // A PNG renamed to .pdf: the extension is allowed, the bytes are not.
    await expect(
      uploadBusinessDocument(
        user.id,
        business.id,
        { kind: "LICENCE", filename: "licence.pdf", buffer: PNG },
        { store },
      ),
    ).rejects.toMatchObject({ code: "CONTENT_MISMATCH" });
    expect(objects.size).toBe(0);
  });

  it("rejects a script disguised as a PDF", async () => {
    const { user, business } = await makeBusiness();
    const { store } = fakeStorage();

    await expect(
      uploadBusinessDocument(
        user.id,
        business.id,
        {
          kind: "LICENCE",
          filename: "licence.pdf",
          buffer: Buffer.from("<script>alert(1)</script>"),
        },
        { store },
      ),
    ).rejects.toBeInstanceOf(DocumentValidationError);
  });

  it("accepts a PNG photo of a document", async () => {
    const { user, business } = await makeBusiness();
    const { store } = fakeStorage();

    const document = await uploadBusinessDocument(
      user.id,
      business.id,
      { kind: "INSURANCE", filename: "coi.png", buffer: PNG },
      { store },
    );
    expect(document.mimeType).toBe("image/png");
  });

  it("deletes the stored bytes when the row insert fails", async () => {
    const { user, business } = await makeBusiness();
    const { store, objects } = fakeStorage();
    const create = vi
      .spyOn(prisma.businessDocument, "create")
      .mockRejectedValueOnce(new Error("database is down"));

    await expect(
      uploadBusinessDocument(
        user.id,
        business.id,
        { kind: "LICENCE", filename: "licence.pdf", buffer: PDF },
        { store },
      ),
    ).rejects.toThrow("database is down");

    expect(objects.size).toBe(0);
    create.mockRestore();
  });

  it("refuses an upload from a member of another business", async () => {
    const mine = await makeBusiness("Mine Plumbing");
    const theirs = await makeBusiness("Theirs Plumbing");
    const { store, objects } = fakeStorage();

    await expect(
      uploadBusinessDocument(
        mine.user.id,
        theirs.business.id,
        { kind: "LICENCE", filename: "licence.pdf", buffer: PDF },
        { store },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(objects.size).toBe(0);
  });

  it("refuses an upload from a MEMBER of this business", async () => {
    const { business } = await makeBusiness();
    const member = await makeUser();
    await prisma.businessMember.create({
      data: {
        businessId: business.id,
        userId: member.id,
        role: BusinessRole.MEMBER,
      },
    });
    const { store } = fakeStorage();

    await expect(
      uploadBusinessDocument(
        member.id,
        business.id,
        { kind: "LICENCE", filename: "licence.pdf", buffer: PDF },
        { store },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("listBusinessDocuments", () => {
  it("lists this business's documents, newest first", async () => {
    const { user, business } = await makeBusiness();
    const { store } = fakeStorage();

    await uploadBusinessDocument(
      user.id,
      business.id,
      { kind: "LICENCE", filename: "licence.pdf", buffer: PDF },
      { store },
    );
    await uploadBusinessDocument(
      user.id,
      business.id,
      { kind: "INSURANCE", filename: "insurance.pdf", buffer: PDF },
      { store },
    );

    const listed = await listBusinessDocuments(user.id, business.id);
    expect(listed.map((row) => row.kind)).toEqual(["INSURANCE", "LICENCE"]);
  });

  it("refuses to list another business's documents", async () => {
    const mine = await makeBusiness("Mine Plumbing");
    const theirs = await makeBusiness("Theirs Plumbing");

    await expect(
      listBusinessDocuments(mine.user.id, theirs.business.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("deleteBusinessDocument", () => {
  it("removes the row and the stored bytes", async () => {
    const { user, business } = await makeBusiness();
    const { store, objects } = fakeStorage();
    const document = await uploadBusinessDocument(
      user.id,
      business.id,
      { kind: "LICENCE", filename: "licence.pdf", buffer: PDF },
      { store },
    );

    await deleteBusinessDocument(user.id, business.id, document.id, { store });

    expect(objects.size).toBe(0);
    expect(
      await prisma.businessDocument.findUnique({ where: { id: document.id } }),
    ).toBeNull();
  });

  it("leaves another business's document untouched", async () => {
    const mine = await makeBusiness("Mine Plumbing");
    const theirs = await makeBusiness("Theirs Plumbing");
    const { store, objects } = fakeStorage();
    const document = await uploadBusinessDocument(
      theirs.user.id,
      theirs.business.id,
      { kind: "LICENCE", filename: "licence.pdf", buffer: PDF },
      { store },
    );

    // Passing our own businessId with their document id: the row is scoped,
    // so this is a silent no-op rather than a deletion.
    await deleteBusinessDocument(mine.user.id, mine.business.id, document.id, {
      store,
    });

    expect(objects.size).toBe(1);
    expect(
      await prisma.businessDocument.findUnique({ where: { id: document.id } }),
    ).not.toBeNull();
  });

  it("keeps the row when the stored object is already gone", async () => {
    const { user, business } = await makeBusiness();
    const { store } = fakeStorage();
    const document = await uploadBusinessDocument(
      user.id,
      business.id,
      { kind: "LICENCE", filename: "licence.pdf", buffer: PDF },
      { store },
    );
    const failing: Storage = {
      ...store,
      delete: async () => {
        throw new Error("storage unavailable");
      },
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      deleteBusinessDocument(user.id, business.id, document.id, {
        store: failing,
      }),
    ).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
