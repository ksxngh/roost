import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  ObjectNotFoundError,
  assertSafeKey,
  type Storage,
} from "@/server/storage/types";

export type S3StorageConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Set for S3-compatible providers such as Cloudflare R2. */
  endpoint?: string;
};

/** S3-compatible object storage (AWS S3, Cloudflare R2, MinIO). */
export class S3Storage implements Storage {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      // R2 and MinIO require path-style addressing.
      forcePathStyle: Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Uploads are user content: never let a browser render them inline
        // from the bucket origin.
        ContentDisposition: "attachment",
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      const bytes = await response.Body?.transformToByteArray();
      if (!bytes) {
        throw new ObjectNotFoundError(key);
      }
      return Buffer.from(bytes);
    } catch (error) {
      if (isNotFound(error)) {
        throw new ObjectNotFoundError(key);
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    ?.$metadata?.httpStatusCode;
  return name === "NoSuchKey" || name === "NotFound" || status === 404;
}
