/**
 * Object storage contract. Implementations must treat keys as opaque and
 * must never allow a key to escape their namespace (see `assertSafeKey`).
 */
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class ObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`No stored object for key "${key}"`);
    this.name = "ObjectNotFoundError";
  }
}

/**
 * Storage keys are generated server-side as `<userId>/<uuid>.<ext>`. This
 * guard is defense in depth: even if a caller ever passes user input through,
 * traversal and absolute paths are rejected before touching a filesystem or
 * bucket.
 */
const SAFE_KEY =
  /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export function assertSafeKey(key: string): void {
  if (
    !key ||
    key.length > 512 ||
    key.includes("..") ||
    key.startsWith("/") ||
    key.includes("\0") ||
    key.includes("\\") ||
    !SAFE_KEY.test(key)
  ) {
    throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
  }
}
