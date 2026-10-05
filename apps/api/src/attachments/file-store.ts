import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createReadStream, existsSync } from "fs";
import { stat, unlink } from "fs/promises";
import { join } from "path";
import type { Readable } from "stream";

// Where attachment bytes live. Local disk by default (development, tests);
// an S3-compatible bucket when S3_BUCKET is set (production). Uploads land on
// disk first (multer), then put() moves them into the store.
export interface FileStore {
  readonly kind: "local" | "s3";
  put(key: string, localPath: string, mime: string): Promise<void>;
  // null when the object is missing.
  read(key: string): Promise<{ stream: Readable; size?: number } | null>;
  remove(key: string): Promise<void>;
}

class LocalStore implements FileStore {
  readonly kind = "local" as const;
  constructor(private readonly dir: string) {}

  async put() {
    // multer already wrote the file into the upload dir.
  }

  async read(key: string) {
    const path = join(this.dir, key);
    if (!existsSync(path)) return null;
    return { stream: createReadStream(path), size: (await stat(path)).size };
  }

  async remove(key: string) {
    await unlink(join(this.dir, key)).catch(() => {});
  }
}

class S3Store implements FileStore {
  readonly kind = "s3" as const;
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    private readonly prefix: string,
    env: NodeJS.ProcessEnv,
  ) {
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION ?? "ru-1",
      credentials: { accessKeyId: env.S3_ACCESS_KEY ?? "", secretAccessKey: env.S3_SECRET_KEY ?? "" },
      // Timeweb, Selectel and most S3-compatible stores need path-style URLs.
      forcePathStyle: true,
    });
  }

  private key(key: string) {
    return `${this.prefix}${key}`;
  }

  async put(key: string, localPath: string, mime: string) {
    const { size } = await stat(localPath);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: this.key(key), Body: createReadStream(localPath), ContentLength: size, ContentType: mime }),
    );
    await unlink(localPath).catch(() => {});
  }

  async read(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(key) }));
      return { stream: res.Body as Readable, size: res.ContentLength };
    } catch (e) {
      if ((e as { name?: string }).name === "NoSuchKey") return null;
      throw e;
    }
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(key) })).catch(() => {});
  }
}

export function createFileStore(uploadDir: string, env = process.env): FileStore {
  if (env.S3_BUCKET) return new S3Store(env.S3_BUCKET, env.S3_PREFIX ?? "files/", env);
  return new LocalStore(uploadDir);
}
