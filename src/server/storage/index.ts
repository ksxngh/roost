import { serverEnv } from "@/lib/env";
import { DbStorage } from "@/server/storage/db-storage";
import { S3Storage } from "@/server/storage/s3-storage";
import type { Storage } from "@/server/storage/types";

export type { Storage } from "@/server/storage/types";
export { ObjectNotFoundError, assertSafeKey } from "@/server/storage/types";

let cached: Storage | undefined;

/**
 * Pick the storage driver from configuration: S3-compatible when a bucket and
 * credentials are present, otherwise the database.
 *
 * The database driver is the default so uploads work everywhere with zero
 * extra setup — including serverless hosts (Vercel) where the filesystem is
 * read-only and there is no local disk to fall back to. Set the `S3_*` vars to
 * switch to a bucket once volume outgrows the database.
 */
export function createStorage(env = serverEnv()): Storage {
  if (env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
    return new S3Storage({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      endpoint: env.S3_ENDPOINT,
    });
  }
  return new DbStorage();
}

/** Process-wide storage instance. */
export function storage(): Storage {
  cached ??= createStorage();
  return cached;
}
