import "server-only";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  mkdir,
  open,
  readFile,
  writeFile,
  rename,
  unlink,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { HttpError, localDriver, projectById, requiredEnv } from "./config";

export interface Store {
  get<T>(key: string): Promise<T | null>;
  put(key: string, data: unknown): Promise<void>;
  list(prefix: string): Promise<string[]>;
  remove(key: string): Promise<void>;
  bytes(key: string): Promise<Uint8Array>;
  readPrefix(key: string, length: number): Promise<Uint8Array>;
  writeBytes(key: string, data: Uint8Array, contentType: string): Promise<void>;
  head(key: string): Promise<{ size: number; contentType: string }>;
  copyPublic(from: string, to: string, contentType: string): Promise<void>;
  copyPrivate(from: string, to: string, contentType: string): Promise<void>;
  signGet(key: string): Promise<string>;
  signPut(key: string, contentType: string): Promise<string>;
  multipartStart(key: string, contentType: string): Promise<string>;
  multipartPart(key: string, uploadId: string, part: number): Promise<string>;
  multipartComplete(
    key: string,
    uploadId: string,
    parts: { PartNumber: number; ETag: string }[],
  ): Promise<void>;
  multipartAbort(key: string, uploadId: string): Promise<void>;
  publicUrl(key: string): string;
}
export function checkKey(key: string) {
  if (
    !key ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.split("/").some((v) => !v || v === "." || v === "..") ||
    /[\x00-\x1f]/.test(key)
  )
    throw new HttpError(400, "Invalid storage key");
  return key;
}
export class SpacesStore implements Store {
  readonly client: S3Client;
  readonly bucket: string;
  private base: string;
  constructor(prefix: string, client?: S3Client) {
    const endpoint = requiredEnv(`${prefix}_SPACES_ENDPOINT`);
    if (new URL(endpoint).protocol !== "https:")
      throw new Error("Spaces endpoint must use HTTPS");
    this.bucket = requiredEnv(`${prefix}_SPACES_BUCKET`);
    this.client =
      client ??
      new S3Client({
        endpoint,
        region: requiredEnv(`${prefix}_SPACES_REGION`),
        credentials: {
          accessKeyId: requiredEnv(`${prefix}_SPACES_ACCESS_KEY`),
          secretAccessKey: requiredEnv(`${prefix}_SPACES_SECRET_KEY`),
        },
        maxAttempts: 4,
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      });
    this.base = (
      process.env[`${prefix}_MEDIA_BASE_URL`] ||
      `https://${this.bucket}.${new URL(endpoint).host}`
    ).replace(/\/$/, "");
    if (new URL(this.base).protocol !== "https:")
      throw new Error("Media base URL must use HTTPS");
  }
  private input(key: string) {
    return { Bucket: this.bucket, Key: checkKey(key) };
  }
  async get<T>(key: string): Promise<T | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand(this.input(key)),
      );
      return JSON.parse(await result.Body!.transformToString()) as T;
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }
  async put(key: string, data: unknown) {
    await this.client.send(
      new PutObjectCommand({
        ...this.input(key),
        Body: JSON.stringify(data),
        ContentType: "application/json",
        ACL: "private",
        CacheControl: "no-store",
      }),
    );
  }
  async list(prefix: string) {
    checkKey(prefix.replace(/\/$/, ""));
    const keys: string[] = [];
    let marker: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsCommand({
          Bucket: this.bucket,
          Prefix: prefix,
          Marker: marker,
          MaxKeys: 1000,
        }),
      );
      const batch = (page.Contents ?? []).flatMap((v) =>
        v.Key ? [v.Key] : [],
      );
      keys.push(...batch);
      if (!page.IsTruncated) break;
      const next = page.NextMarker ?? batch.at(-1);
      if (!next || (marker && next <= marker))
        throw new Error("Storage pagination did not advance");
      marker = next;
    } while (true);
    return keys;
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand(this.input(key)));
  }
  async bytes(key: string) {
    const result = await this.client.send(
      new GetObjectCommand(this.input(key)),
    );
    return result.Body!.transformToByteArray();
  }
  async readPrefix(key: string, length: number) {
    if (!Number.isInteger(length) || length < 1 || length > 64 * 1024)
      throw new Error("Invalid storage prefix length");
    const result = await this.client.send(
      new GetObjectCommand({
        ...this.input(key),
        Range: `bytes=0-${length - 1}`,
      }),
    );
    return (await result.Body!.transformToByteArray()).subarray(0, length);
  }
  async writeBytes(key: string, data: Uint8Array, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        ...this.input(key),
        Body: data,
        ContentType: contentType,
        ACL: "private",
      }),
    );
  }
  async head(key: string) {
    const result = await this.client.send(
      new HeadObjectCommand(this.input(key)),
    );
    return {
      size: result.ContentLength ?? 0,
      contentType: result.ContentType ?? "",
    };
  }
  async copyPublic(from: string, to: string, contentType: string) {
    await this.client.send(
      new CopyObjectCommand({
        ...this.input(to),
        CopySource: `${this.bucket}/${checkKey(from).split("/").map(encodeURIComponent).join("/")}`,
        ACL: "public-read",
        ContentType: contentType,
        MetadataDirective: "REPLACE",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }
  async copyPrivate(from: string, to: string, contentType: string) {
    await this.client.send(
      new CopyObjectCommand({
        ...this.input(to),
        CopySource: `${this.bucket}/${checkKey(from).split("/").map(encodeURIComponent).join("/")}`,
        ACL: "private",
        ContentType: contentType,
        MetadataDirective: "REPLACE",
        CacheControl: "no-store",
      }),
    );
  }
  signGet(key: string) {
    return getSignedUrl(this.client, new GetObjectCommand(this.input(key)), {
      expiresIn: 300,
    });
  }
  signPut(key: string, contentType: string) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        ...this.input(key),
        ContentType: contentType,
        ACL: "private",
      }),
      { expiresIn: 300 },
    );
  }
  async multipartStart(key: string, contentType: string) {
    const result = await this.client.send(
      new CreateMultipartUploadCommand({
        ...this.input(key),
        ContentType: contentType,
        ACL: "private",
      }),
    );
    if (!result.UploadId) throw new Error("Missing upload ID");
    return result.UploadId;
  }
  multipartPart(key: string, uploadId: string, part: number) {
    return getSignedUrl(
      this.client,
      new UploadPartCommand({
        ...this.input(key),
        UploadId: uploadId,
        PartNumber: part,
      }),
      { expiresIn: 300 },
    );
  }
  async multipartComplete(
    key: string,
    uploadId: string,
    parts: { PartNumber: number; ETag: string }[],
  ) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        ...this.input(key),
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  }
  async multipartAbort(key: string, uploadId: string) {
    await this.client.send(
      new AbortMultipartUploadCommand({
        ...this.input(key),
        UploadId: uploadId,
      }),
    );
  }
  publicUrl(key: string) {
    return `${this.base}/${checkKey(key).split("/").map(encodeURIComponent).join("/")}`;
  }
}
function missing(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "name" in error &&
    ["NoSuchKey", "NotFound"].includes(String(error.name))
  );
}

export class LocalStore implements Store {
  constructor(
    private scope: string,
    private root = process.env.LOCAL_STORAGE_PATH ||
      path.resolve(".local-storage"),
  ) {
    checkKey(scope);
  }
  private file(key: string) {
    return path.join(this.root, this.scope, checkKey(key));
  }
  async get<T>(key: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(this.file(key), "utf8")) as T;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  async put(key: string, data: unknown) {
    await this.writeBytes(
      key,
      Buffer.from(JSON.stringify(data)),
      "application/json",
    );
  }
  async list(prefix: string) {
    const base = path.join(this.root, this.scope);
    const out: string[] = [];
    async function walk(dir: string) {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
        throw e;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else {
          const key = path.relative(base, full).split(path.sep).join("/");
          if (
            key.startsWith(prefix) &&
            !key.endsWith(".meta") &&
            !key.includes(".tmp-")
          )
            out.push(key);
        }
      }
    }
    await walk(base);
    return out.sort();
  }
  async remove(key: string) {
    const file = this.file(key);
    for (const target of [file, `${file}.meta`])
      await unlink(target).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== "ENOENT") throw e;
      });
  }
  async bytes(key: string) {
    return readFile(this.file(key));
  }
  async readPrefix(key: string, length: number) {
    if (!Number.isInteger(length) || length < 1 || length > 64 * 1024)
      throw new Error("Invalid storage prefix length");
    const file = await open(this.file(key), "r");
    try {
      const prefix = Buffer.alloc(length);
      const { bytesRead } = await file.read(prefix, 0, length, 0);
      return prefix.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
  }
  async writeBytes(key: string, data: Uint8Array, contentType: string) {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp-${randomUUID()}`;
    await writeFile(temp, data);
    await rename(temp, file);
    await writeFile(
      `${file}.meta`,
      JSON.stringify({ size: data.length, contentType }),
    );
  }
  async head(key: string) {
    const file = this.file(key);
    try {
      await stat(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new HttpError(404, "Stored object not found");
      throw error;
    }
    return JSON.parse(await readFile(`${file}.meta`, "utf8")) as {
      size: number;
      contentType: string;
    };
  }
  async copyPublic(from: string, to: string, contentType: string) {
    await this.writeBytes(to, await this.bytes(from), contentType);
  }
  async copyPrivate(from: string, to: string, contentType: string) {
    await this.writeBytes(to, await this.bytes(from), contentType);
  }
  async signGet(key: string) {
    return `/api/local-media/${this.scope}/${checkKey(key)}`;
  }
  async signPut() {
    throw new Error("Local uploads use the authenticated byte endpoint");
    return "";
  }
  async multipartStart() {
    throw new Error("Use single uploads with the local adapter");
    return "";
  }
  async multipartPart() {
    throw new Error("Use single uploads with the local adapter");
    return "";
  }
  async multipartComplete() {
    throw new Error("Use single uploads with the local adapter");
  }
  async multipartAbort() {
    /* No local multipart uploads. */
  }
  publicUrl(key: string) {
    return `/api/local-media/${this.scope}/${checkKey(key)}`;
  }
}
const stores = new Map<string, Store>();
export function controlStore() {
  return storeFor("__control", "CONTROL");
}
export function projectStore(id: string) {
  projectById(id);
  if (localDriver()) return storeFor(id, id);
  return new NamespacedStore(
    storeFor("__content", "CONTENT"),
    `projects/${id}`,
  );
}
function storeFor(scope: string, prefix: string) {
  if (!localDriver()) {
    const targets = ["CONTROL", "CONTENT"].flatMap((name) => {
      const endpoint = process.env[`${name}_SPACES_ENDPOINT`];
      const bucket = process.env[`${name}_SPACES_BUCKET`];
      return endpoint && bucket
        ? [`${new URL(endpoint).origin}/${bucket}`]
        : [];
    });
    if (new Set(targets).size !== targets.length)
      throw new HttpError(
        503,
        "Configure distinct Spaces for control and content storage.",
      );
  }
  if (!stores.has(scope))
    stores.set(
      scope,
      localDriver() ? new LocalStore(scope) : new SpacesStore(prefix),
    );
  return stores.get(scope)!;
}

class NamespacedStore implements Store {
  private readonly objectPrefix: string;

  constructor(
    private readonly store: Store,
    namespace: string,
  ) {
    this.objectPrefix = `${checkKey(namespace)}/`;
  }

  private key(key: string) {
    return `${this.objectPrefix}${checkKey(key)}`;
  }

  async get<T>(key: string) {
    return this.store.get<T>(this.key(key));
  }

  async put(key: string, data: unknown) {
    await this.store.put(this.key(key), data);
  }

  async list(prefix: string) {
    const checkedPrefix = checkKey(prefix.replace(/\/$/, ""));
    const trailingSlash = prefix.endsWith("/") ? "/" : "";
    const fullPrefix = `${this.objectPrefix}${checkedPrefix}${trailingSlash}`;
    const keys = await this.store.list(fullPrefix);
    return keys
      .filter((key) => key.startsWith(this.objectPrefix))
      .map((key) => key.slice(this.objectPrefix.length));
  }

  async remove(key: string) {
    await this.store.remove(this.key(key));
  }

  async bytes(key: string) {
    return this.store.bytes(this.key(key));
  }

  async readPrefix(key: string, length: number) {
    return this.store.readPrefix(this.key(key), length);
  }

  async writeBytes(key: string, data: Uint8Array, contentType: string) {
    await this.store.writeBytes(this.key(key), data, contentType);
  }

  async head(key: string) {
    return this.store.head(this.key(key));
  }

  async copyPublic(from: string, to: string, contentType: string) {
    await this.store.copyPublic(this.key(from), this.key(to), contentType);
  }

  async copyPrivate(from: string, to: string, contentType: string) {
    await this.store.copyPrivate(this.key(from), this.key(to), contentType);
  }

  async signGet(key: string) {
    return this.store.signGet(this.key(key));
  }

  async signPut(key: string, contentType: string) {
    return this.store.signPut(this.key(key), contentType);
  }

  async multipartStart(key: string, contentType: string) {
    return this.store.multipartStart(this.key(key), contentType);
  }

  async multipartPart(key: string, uploadId: string, part: number) {
    return this.store.multipartPart(this.key(key), uploadId, part);
  }

  async multipartComplete(
    key: string,
    uploadId: string,
    parts: { PartNumber: number; ETag: string }[],
  ) {
    await this.store.multipartComplete(this.key(key), uploadId, parts);
  }

  async multipartAbort(key: string, uploadId: string) {
    await this.store.multipartAbort(this.key(key), uploadId);
  }

  publicUrl(key: string) {
    return this.store.publicUrl(this.key(key));
  }
}

export async function mapBounded<T, R>(
  items: T[],
  task: (item: T) => Promise<R>,
  limit = 8,
) {
  const result = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        result[index] = await task(items[index]);
      }
    }),
  );
  return result;
}
