// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db";
import { DbStorage } from "@/server/storage/db-storage";
import { ObjectNotFoundError } from "@/server/storage/types";

const storage = new DbStorage();

beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("roost_test");
});

afterEach(async () => {
  await prisma.storedObject.deleteMany();
});

function key(): string {
  return `u-${Date.now()}-${Math.random().toString(36).slice(2)}/file.pdf`;
}

describe("DbStorage", () => {
  it("round-trips binary content byte-for-byte", async () => {
    const k = key();
    const body = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x10]); // %PDF + binary
    await storage.put(k, body, "application/pdf");

    const out = await storage.get(k);
    expect(Buffer.compare(out, body)).toBe(0);
    expect(await storage.exists(k)).toBe(true);
  });

  it("overwrites on re-put to the same key", async () => {
    const k = key();
    await storage.put(k, Buffer.from("first"), "text/plain");
    await storage.put(k, Buffer.from("second"), "text/plain");
    expect((await storage.get(k)).toString()).toBe("second");
    expect(await prisma.storedObject.count({ where: { key: k } })).toBe(1);
  });

  it("throws ObjectNotFoundError for a missing key", async () => {
    await expect(storage.get(key())).rejects.toBeInstanceOf(
      ObjectNotFoundError,
    );
  });

  it("delete is idempotent and clears existence", async () => {
    const k = key();
    await storage.put(k, Buffer.from("x"), "text/plain");
    await storage.delete(k);
    expect(await storage.exists(k)).toBe(false);
    // Deleting again does not throw.
    await expect(storage.delete(k)).resolves.toBeUndefined();
  });

  it("rejects an unsafe key before touching the database", async () => {
    await expect(
      storage.put("../../etc/passwd", Buffer.from("x"), "text/plain"),
    ).rejects.toThrow(/Unsafe storage key/);
  });
});
