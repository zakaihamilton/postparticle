import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError, localDriver } from "./config";
import { append } from "./events";
import { getMedia, original, parsedId } from "./media";
import { hasValidMediaStructure } from "./media-binary-validation";
import type { Store } from "./storage";
import type { Media } from "./types";

const maxMediaSize = 1024 * 1024 * 1024;
const maxLocalMediaSize = 32 * 1024 * 1024;
const partSize = 8 * 1024 * 1024;
const allowed = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
] as const;
const validationWindowLength = 64 * 1024;

const uploadSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.enum(allowed),
  size: z.number().int().positive().max(maxMediaSize),
});

interface Upload {
  media: Media;
  uploadId: string | null;
  expiresAt: number;
  completed?: boolean;
}

const incoming = (id: string) => `incoming/${parsedId(id)}/asset`;
const ticket = (id: string) => `uploads/${parsedId(id)}.json`;

async function getUpload(id: string, store: Store) {
  const upload = await store.get<Upload>(ticket(id));
  if (!upload || upload.expiresAt < Date.now())
    throw new HttpError(410, "Upload expired. Start again.");
  return upload;
}

async function cleanupUpload(id: string, store: Store) {
  await store.remove(incoming(id));
  await store.remove(ticket(id));
}

function isMissingUpload(error: unknown) {
  return (
    error instanceof Object && "name" in error && error.name === "NoSuchUpload"
  );
}

export async function startUpload(
  _actor: string,
  input: unknown,
  store: Store,
  projectId: string,
) {
  const parsed = uploadSchema.parse(input);
  const local = localDriver();
  if (local && parsed.size > maxLocalMediaSize)
    throw new HttpError(413, "Local test uploads are limited to 32 MiB");
  const id = randomUUID();
  const media: Media = {
    ...parsed,
    id,
    alt: "",
    caption: "",
    metadata: {},
    createdAt: new Date().toISOString(),
    ready: false,
    deleted: false,
  };
  const multipart = !local && parsed.size > 16 * 1024 * 1024;
  const uploadId = multipart
    ? await store.multipartStart(incoming(id), parsed.contentType)
    : null;
  await store.put(ticket(id), {
    media,
    uploadId,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  } satisfies Upload);
  return {
    id,
    multipart,
    partSize,
    url: multipart
      ? null
      : local
        ? `/api/manage/projects/${projectId}/media/${id}/bytes`
        : await store.signPut(incoming(id), parsed.contentType),
  };
}

export async function signPart(id: string, part: number, store: Store) {
  const upload = await getUpload(id, store);
  if (
    !upload.uploadId ||
    !Number.isInteger(part) ||
    part < 1 ||
    part > Math.ceil(upload.media.size / partSize)
  )
    throw new HttpError(400, "Invalid upload part");
  return store.multipartPart(incoming(id), upload.uploadId, part);
}

export async function writeLocalUpload(
  id: string,
  data: Uint8Array,
  store: Store,
) {
  if (!localDriver()) throw new HttpError(404, "Not found");
  const upload = await getUpload(id, store);
  if (data.length !== upload.media.size)
    throw new HttpError(400, "Upload size does not match");
  await store.writeBytes(incoming(id), data, upload.media.contentType);
}

export async function finishUpload(
  actor: string,
  id: string,
  rawParts: unknown,
  store: Store,
) {
  const existing = await getMedia(id, store);
  if (existing?.deleted) throw new HttpError(410, "This asset was deleted");
  if (existing?.ready) {
    await cleanupUpload(id, store);
    return;
  }
  const upload = await getUpload(id, store);
  if (upload.uploadId && !upload.completed) {
    const parts = z
      .array(
        z.object({
          PartNumber: z.number().int().positive(),
          ETag: z.string().min(1).max(200),
        }),
      )
      .parse(rawParts);
    if (
      parts.length !== Math.ceil(upload.media.size / partSize) ||
      parts.some((p, i) => p.PartNumber !== i + 1)
    )
      throw new HttpError(400, "Upload parts are incomplete");
    try {
      await store.multipartComplete(incoming(id), upload.uploadId, parts);
    } catch (error) {
      // Completion may have committed even when its response or checkpoint was lost.
      if (!isMissingUpload(error)) throw error;
      await store.head(incoming(id));
    }
    await store.put(ticket(id), { ...upload, completed: true });
  }
  const head = await store.head(incoming(id));
  if (head.size !== upload.media.size) {
    await cleanupUpload(id, store);
    throw new HttpError(400, "Uploaded file does not match its declared size");
  }
  const [prefix, suffix] = await Promise.all([
    store.readPrefix(incoming(id), validationWindowLength),
    store.readSuffix(incoming(id), validationWindowLength, head.size),
  ]);
  if (
    head.contentType !== upload.media.contentType ||
    !hasValidMediaStructure(upload.media.contentType, prefix, suffix, head.size)
  ) {
    await cleanupUpload(id, store);
    throw new HttpError(
      415,
      "Uploaded file is malformed, truncated, or does not match its declared format",
    );
  }
  // Seal the upload under a different key; still-valid upload URLs cannot modify the original.
  await store.copyPrivate(incoming(id), original(id), upload.media.contentType);
  await append(store, `media/${upload.media.id}`, actor, "upload", {
    ...upload.media,
    ready: true,
  });
  await cleanupUpload(id, store);
}

export async function abortUpload(id: string, store: Store) {
  const upload = await store.get<Upload>(ticket(id));
  if (!upload) return;
  if (upload.uploadId && !upload.completed) {
    try {
      await store.multipartAbort(incoming(id), upload.uploadId);
    } catch (error) {
      if (!isMissingUpload(error)) throw error;
    }
  }
  await cleanupUpload(id, store);
}
