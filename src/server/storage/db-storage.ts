import { prisma } from "@/server/db";
import {
  ObjectNotFoundError,
  assertSafeKey,
  type Storage,
} from "@/server/storage/types";

/**
 * Database-backed object storage.
 *
 * The default driver when no S3-compatible bucket is configured. Bytes live in
 * a `stored_object` row (`bytea`), so uploads need no filesystem (which is
 * read-only on serverless hosts like Vercel) and no third-party account. Files
 * stay private — served only through the app's authenticated download routes,
 * never a public URL — which matters for licence and insurance documents.
 *
 * Same contract as the S3 and filesystem drivers, so application code never
 * branches on the driver in use.
 */
export class DbStorage implements Storage {
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key);
    // Prisma's `Bytes` maps to Uint8Array; copy into a fresh one so the type is
    // an ArrayBuffer-backed Uint8Array (a Buffer's backing buffer is wider).
    const data = Uint8Array.from(body);
    await prisma.storedObject.upsert({
      where: { key },
      create: { key, data, contentType, size: body.length },
      update: { data, contentType, size: body.length },
    });
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const row = await prisma.storedObject.findUnique({
      where: { key },
      select: { data: true },
    });
    if (!row) throw new ObjectNotFoundError(key);
    // Prisma returns `Bytes` as a Uint8Array; normalise to Buffer for callers.
    return Buffer.from(row.data);
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    // deleteMany, not delete: removing an already-absent object is a no-op,
    // matching the S3 driver rather than throwing.
    await prisma.storedObject.deleteMany({ where: { key } });
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    return (await prisma.storedObject.count({ where: { key } })) > 0;
  }
}
