import "server-only";
import { Readable } from "node:stream";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requiredEnv } from "../config";
import { checkKey, mapBounded, type Store } from "./types";

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
  async list(prefix: string, marker?: string) {
    checkKey(prefix.replace(/\/$/, ""));
    if (marker) checkKey(marker.replace(/\/$/, ""));
    const keys: string[] = [];
    let nextMarker = marker;
    do {
      const page = await this.client.send(
        new ListObjectsCommand({
          Bucket: this.bucket,
          Prefix: prefix,
          Marker: nextMarker,
          MaxKeys: 1000,
        }),
      );
      const batch = (page.Contents ?? []).flatMap((v) =>
        v.Key ? [v.Key] : [],
      );
      keys.push(...batch);
      if (!page.IsTruncated) break;
      const next = page.NextMarker ?? batch.at(-1);
      if (!next || (nextMarker && next <= nextMarker))
        throw new Error("Storage pagination did not advance");
      nextMarker = next;
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
  async readStream(key: string) {
    const result = await this.client.send(
      new GetObjectCommand(this.input(key)),
    );
    if (!result.Body) throw new Error("Stored object has no response body");
    return Readable.from(
      result.Body.transformToWebStream() as unknown as AsyncIterable<Uint8Array>,
      { objectMode: false },
    );
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
  async readSuffix(key: string, length: number, size?: number) {
    if (!Number.isInteger(length) || length < 1 || length > 64 * 1024)
      throw new Error("Invalid storage suffix length");
    const objectSize = size ?? (await this.head(key)).size;
    const result = await this.client.send(
      new GetObjectCommand({
        ...this.input(key),
        Range: `bytes=${Math.max(0, objectSize - length)}-${Math.max(0, objectSize - 1)}`,
      }),
    );
    return result.Body!.transformToByteArray();
  }
  async writeBytes(
    key: string,
    data: Uint8Array,
    contentType: string,
    cacheControl?: string,
  ) {
    await this.client.send(
      new PutObjectCommand({
        ...this.input(key),
        Body: data,
        ContentType: contentType,
        ACL: "private",
        ...(cacheControl ? { CacheControl: cacheControl } : {}),
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
  private async copyWithPolicy(
    from: string,
    to: string,
    contentType: string,
    acl: "public-read" | "private",
    cacheControl: string,
  ) {
    await this.client.send(
      new CopyObjectCommand({
        ...this.input(to),
        CopySource: `${this.bucket}/${checkKey(from).split("/").map(encodeURIComponent).join("/")}`,
        ACL: acl,
        ContentType: contentType,
        MetadataDirective: "REPLACE",
        CacheControl: cacheControl,
      }),
    );
  }
  async copyPublic(from: string, to: string, contentType: string) {
    await this.copyWithPolicy(
      from,
      to,
      contentType,
      "public-read",
      "public, max-age=31536000, immutable",
    );
  }
  async copyPrivate(from: string, to: string, contentType: string) {
    await this.copyWithPolicy(from, to, contentType, "private", "no-store");
  }
  signGet(key: string, expiresIn = 300) {
    return getSignedUrl(this.client, new GetObjectCommand(this.input(key)), {
      expiresIn,
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
  async purgePrefixBatch(prefix: string) {
    const checkedPrefix = checkKey(prefix.replace(/\/$/, "")) + "/";
    const page = await this.client.send(
      new ListObjectVersionsCommand({
        Bucket: this.bucket,
        Prefix: checkedPrefix,
        MaxKeys: 1000,
      }),
    );
    const toVersionIdentifiers = (
      items: Array<{ Key?: string; VersionId?: string }> | undefined,
    ) =>
      (items ?? []).flatMap((item) =>
        item.Key
          ? [
              {
                Key: item.Key,
                ...(item.VersionId === undefined
                  ? {}
                  : { VersionId: item.VersionId }),
              },
            ]
          : [],
      );
    const objects = [
      ...toVersionIdentifiers(page.Versions),
      ...toVersionIdentifiers(page.DeleteMarkers),
    ];
    if (objects.length) {
      const deleted = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: objects, Quiet: true },
        }),
      );
      if (deleted.Errors?.length)
        throw new Error("Some stored object versions could not be deleted");
    }

    const uploads = await this.client.send(
      new ListMultipartUploadsCommand({
        Bucket: this.bucket,
        Prefix: checkedPrefix,
        MaxUploads: 1000,
      }),
    );
    await mapBounded(uploads.Uploads ?? [], async (upload) => {
      if (upload.Key && upload.UploadId)
        await this.multipartAbort(upload.Key, upload.UploadId);
    });
    return {
      done:
        !page.IsTruncated &&
        !uploads.IsTruncated &&
        objects.length === 0 &&
        !uploads.Uploads?.length,
      deleted: objects.length,
    };
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
