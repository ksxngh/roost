import path from "node:path";

import { serverEnv } from "@/lib/env";
import { LocalStorage } from "@/server/storage/local-storage";
import { S3Storage } from "@/server/storage/s3-storage";
import type { Storage } from "@/server/storage/types";

export type { Storage } from "@/server/storage/types";
export { ObjectNotFoundError, assertSafeKey } from "@/server/storage/types";

let cached: Storage | undefined;

/**
 * Pick the storage driver from configuration: S3-compatible when a bucket and
 * credentials are present, filesystem otherwise. Development therefore needs
 * no cloud account, and production is one env change away.
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
  return new LocalStorage(path.resolve(process.cwd(), env.LOCAL_STORAGE_DIR));
}

/** Process-wide storage instance. */
export function storage(): Storage {
  cached ??= createStorage();
  return cached;
}
