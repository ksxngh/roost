import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  ObjectNotFoundError,
  assertSafeKey,
  type Storage,
} from "@/server/storage/types";

/**
 * Filesystem-backed storage for development and tests. Keeps the same
 * contract as the S3 driver so application code never branches on driver.
 */
export class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  /**
   * Resolve a key under the root and verify it did not escape. `assertSafeKey`
   * already rejects traversal; this re-checks the resolved path so a future
   * change to the pattern cannot silently open a hole.
   */
  private resolve(key: string): string {
    assertSafeKey(key);
    const absoluteRoot = path.resolve(this.root);
    const target = path.resolve(absoluteRoot, key);
    if (
      target !== absoluteRoot &&
      !target.startsWith(absoluteRoot + path.sep)
    ) {
      throw new Error(`Resolved storage key escapes the root: ${key}`);
    }
    return target;
  }

  // `contentType` is part of the Storage contract but has no filesystem
  // equivalent; it is recorded on the document row instead.
  async put(key: string, body: Buffer, _contentType?: string): Promise<void> {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Write to a temporary file then rename, so a crash mid-write can never
    // leave a partially written object readable under its final key.
    const temp = `${target}.${createHash("sha1")
      .update(`${Date.now()}${Math.random()}`)
      .digest("hex")
      .slice(0, 8)}.tmp`;
    await fs.writeFile(temp, body);
    await fs.rename(temp, target);
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ObjectNotFoundError(key);
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch (error) {
      // Deleting an absent object is a no-op, matching S3 semantics.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}
