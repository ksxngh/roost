// @vitest-environment node
/**
 * Credential download. Documents are private, so the important cases are the
 * ones that must *not* return bytes — and the response headers that stop a
 * stored file from executing in our origin.
 */
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/server/session", () => ({ getSession: mockGetSession }));

const { prisma } = await import("@/server/db");
const { createBusiness } = await import("@/server/businesses/businesses");
const { uploadBusinessDocument } =
  await import("@/server/businesses/documents");
const { GET } = await import("@/app/api/documents/[id]/route");

const PDF = Buffer.from("%PDF-1.4\n%âãÏÓ\n", "binary");

let seq = 0;

/**
 * The route resolves storage through the module-level `storage()` singleton,
 * so the local driver is used, pointed at a throwaway directory outside the
 * repository.
 */
const scratchDir = path.join(os.tmpdir(), `roost-test-${randomUUID()}`);

async function makeUser() {
  seq += 1;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      name: `User ${seq}`,
      email: `dl-${Date.now()}-${seq}@example.com`,
      emailVerified: true,
    },
  });
}

async function makeBusinessWithDocument(name: string) {
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
  const document = await uploadBusinessDocument(user.id, business.id, {
    kind: "LICENCE",
    filename: "trade licence.pdf",
    buffer: PDF,
  });
  return { user, business, document };
}

function call(id: string) {
  return GET(new Request(`http://localhost/api/documents/${id}`), {
    params: Promise.resolve({ id }),
  });
}

beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("roost_test");
  process.env.LOCAL_STORAGE_DIR = scratchDir;
});

beforeEach(async () => {
  vi.clearAllMocks();
  await prisma.business.deleteMany();
  await prisma.serviceCategory.deleteMany();
  await prisma.user.deleteMany();
});

describe("GET /api/documents/[id]", () => {
  it("returns the document to its own business", async () => {
    const { user, document } = await makeBusinessWithDocument("Mine Plumbing");
    mockGetSession.mockResolvedValue({ user: { id: user.id } });

    const response = await call(document.id);

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PDF);
  });

  it("forces a download and blocks MIME sniffing", async () => {
    const { user, document } = await makeBusinessWithDocument("Mine Plumbing");
    mockGetSession.mockResolvedValue({ user: { id: user.id } });

    const response = await call(document.id);

    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment;/);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("turns away a signed-out visitor", async () => {
    const { document } = await makeBusinessWithDocument("Mine Plumbing");
    mockGetSession.mockResolvedValue(null);

    expect((await call(document.id)).status).toBe(401);
  });

  it("hides another business's document behind a 404", async () => {
    const theirs = await makeBusinessWithDocument("Theirs Plumbing");
    const mine = await makeBusinessWithDocument("Mine Plumbing");
    mockGetSession.mockResolvedValue({ user: { id: mine.user.id } });

    expect((await call(theirs.document.id)).status).toBe(404);
  });

  it("404s an unknown id", async () => {
    const { user } = await makeBusinessWithDocument("Mine Plumbing");
    mockGetSession.mockResolvedValue({ user: { id: user.id } });

    expect((await call(randomUUID())).status).toBe(404);
  });

  it("404s a signed-in user with no business", async () => {
    const { document } = await makeBusinessWithDocument("Mine Plumbing");
    const stranger = await makeUser();
    mockGetSession.mockResolvedValue({ user: { id: stranger.id } });

    expect((await call(document.id)).status).toBe(404);
  });
});
