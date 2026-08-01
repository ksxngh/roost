// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalStorage } from "@/server/storage/local-storage";
import { ObjectNotFoundError, assertSafeKey } from "@/server/storage/types";

let root: string;
let store: LocalStorage;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "roost-storage-"));
  store = new LocalStorage(root);
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("assertSafeKey", () => {
  it("accepts generated keys", () => {
    expect(() => assertSafeKey("user_123/2f8a-4c1e.pdf")).not.toThrow();
  });

  it.each([
    ["parent traversal", "../secrets.txt"],
    ["nested traversal", "user/../../etc/passwd"],
    ["absolute path", "/etc/passwd"],
    ["backslash path", "user\\..\\secrets"],
    ["null byte", "user/file\0.pdf"],
    ["empty", ""],
    ["leading dot segment", "./file"],
  ])("rejects %s", (_label, key) => {
    expect(() => assertSafeKey(key)).toThrow(/Unsafe storage key/);
  });

  it("rejects absurdly long keys", () => {
    expect(() => assertSafeKey("a".repeat(513))).toThrow(/Unsafe storage key/);
  });
});

describe("LocalStorage", () => {
  it("round-trips an object", async () => {
    const body = Buffer.from("lecture notes");
    await store.put("user_1/a.txt", body, "text/plain");
    expect(await store.get("user_1/a.txt")).toEqual(body);
  });

  it("reports existence accurately", async () => {
    expect(await store.exists("user_1/missing.txt")).toBe(false);
    await store.put("user_1/here.txt", Buffer.from("x"), "text/plain");
    expect(await store.exists("user_1/here.txt")).toBe(true);
  });

  it("throws ObjectNotFoundError for a missing key", async () => {
    await expect(store.get("user_1/nope.txt")).rejects.toBeInstanceOf(
      ObjectNotFoundError,
    );
  });

  it("treats deleting a missing object as a no-op", async () => {
    await expect(store.delete("user_1/nope.txt")).resolves.toBeUndefined();
  });

  it("deletes an existing object", async () => {
    await store.put("user_1/gone.txt", Buffer.from("x"), "text/plain");
    await store.delete("user_1/gone.txt");
    expect(await store.exists("user_1/gone.txt")).toBe(false);
  });

  it("refuses to read or write outside its root", async () => {
    const outside = path.join(root, "..", "escaped.txt");
    await fs.writeFile(outside, "secret").catch(() => {});
    await expect(store.get("../escaped.txt")).rejects.toThrow(
      /Unsafe storage key/,
    );
    await expect(
      store.put("../escaped2.txt", Buffer.from("x"), "text/plain"),
    ).rejects.toThrow(/Unsafe storage key/);
    await fs.rm(outside, { force: true });
  });

  it("leaves no temporary files behind after a write", async () => {
    await store.put("user_1/clean.txt", Buffer.from("data"), "text/plain");
    const entries = await fs.readdir(path.join(root, "user_1"));
    expect(entries).toEqual(["clean.txt"]);
  });

  it("overwrites an existing key atomically", async () => {
    await store.put("user_1/x.txt", Buffer.from("first"), "text/plain");
    await store.put("user_1/x.txt", Buffer.from("second"), "text/plain");
    expect((await store.get("user_1/x.txt")).toString()).toBe("second");
  });

  it("stores binary content without corruption", async () => {
    const binary = Buffer.from([0x00, 0xff, 0x10, 0x80, 0x7f]);
    await store.put("user_1/b.bin", binary, "application/octet-stream");
    expect(await store.get("user_1/b.bin")).toEqual(binary);
  });
});
