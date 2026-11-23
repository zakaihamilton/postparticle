import "server-only";
import type { Readable } from "node:stream";
import { HttpError } from "../config";

export interface Store {
  get<T>(key: string): Promise<T | null>;
  put(key: string, data: unknown): Promise<void>;
  list(prefix: string, marker?: string): Promise<string[]>;
  remove(key: string): Promise<void>;
  bytes(key: string): Promise<Uint8Array>;
  readStream(key: string): Promise<Readable>;
  readPrefix(key: string, length: number): Promise<Uint8Array>;
  readSuffix(key: string, length: number, size?: number): Promise<Uint8Array>;
  writeBytes(
    key: string,
    data: Uint8Array,
    contentType: string,
    cacheControl?: string,
  ): Promise<void>;
  head(key: string): Promise<{ size: number; contentType: string }>;
  copyPublic(from: string, to: string, contentType: string): Promise<void>;
  copyPrivate(from: string, to: string, contentType: string): Promise<void>;
  signGet(key: string, expiresIn?: number): Promise<string>;
  signPut(key: string, contentType: string): Promise<string>;
  multipartStart(key: string, contentType: string): Promise<string>;
  multipartPart(key: string, uploadId: string, part: number): Promise<string>;
  multipartComplete(
    key: string,
    uploadId: string,
    parts: { PartNumber: number; ETag: string }[],
  ): Promise<void>;
  multipartAbort(key: string, uploadId: string): Promise<void>;
  purgePrefixBatch(prefix: string): Promise<{ done: boolean; deleted: number }>;
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
