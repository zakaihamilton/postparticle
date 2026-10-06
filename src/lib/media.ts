import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError, localDriver } from "./config";
import { append, events } from "./events";
import { mapBounded, type Store } from "./storage";
import { mediaReferences, records } from "./content";
import type { Kind, Media } from "./types";
import { replaceMediaReferences } from "./media-references";
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
const signatureLength = 16;
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
const parsedId = (id: string) => z.string().uuid().parse(id).toLowerCase();
const original = (id: string) => `originals/${parsedId(id)}/asset`;
export const delivery = (id: string) => `public/media/${parsedId(id)}/asset`;
const incoming = (id: string) => `incoming/${parsedId(id)}/asset`;
const ticket = (id: string) => `uploads/${parsedId(id)}.json`;
export async function getMedia(id: string, store: Store) {
  return (
    (await events<Media>(store, `media/${parsedId(id)}`)).at(-1)?.data ?? null
  );
}
export async function listMedia(store: Store) {
  const history = await events<Media>(store, "media");
  const latest = new Map<string, Media>();
  for (const event of history) latest.set(event.data.id, event.data);
  return [...latest.values()]
    .filter((m) => !m.deleted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function startUpload(
  actor: string,
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
async function getUpload(id: string, store: Store) {
  const upload = await store.get<Upload>(ticket(id));
  if (!upload || upload.expiresAt < Date.now())
    throw new HttpError(410, "Upload expired. Start again.");
  return upload;
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
  const prefix = await store.readPrefix(incoming(id), signatureLength);
  if (
    head.contentType !== upload.media.contentType ||
    !hasDeclaredSignature(upload.media.contentType, prefix)
  ) {
    await cleanupUpload(id, store);
    throw new HttpError(
      415,
      "Uploaded file does not match its declared content type",
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
async function cleanupUpload(id: string, store: Store) {
  await store.remove(incoming(id));
  await store.remove(ticket(id));
}
function isMissingUpload(error: unknown) {
  return (
    error instanceof Object && "name" in error && error.name === "NoSuchUpload"
  );
}
function asciiAt(bytes: Uint8Array, offset: number, value: string) {
  if (bytes.length < offset + value.length) return false;
  return [...value].every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );
}
function hasDeclaredSignature(contentType: string, bytes: Uint8Array) {
  switch (contentType) {
    case "image/jpeg":
      return (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      );
    case "image/png":
      return (
        bytes.length >= 8 &&
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
          (byte, index) => bytes[index] === byte,
        )
      );
    case "image/webp":
      return (
        bytes.length >= 12 &&
        asciiAt(bytes, 0, "RIFF") &&
        asciiAt(bytes, 8, "WEBP")
      );
    case "image/gif":
      return asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a");
    case "video/mp4":
      return bytes.length >= 12 && asciiAt(bytes, 4, "ftyp");
    case "video/webm":
      return (
        bytes.length >= 4 &&
        bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3
      );
    default:
      return false;
  }
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
export async function editMedia(
  actor: string,
  id: string,
  input: unknown,
  store: Store,
) {
  const media = await getMedia(id, store);
  if (!media || media.deleted) throw new HttpError(404, "Media not found");
  const data = z
    .object({
      alt: z.string().max(500),
      caption: z.string().max(2000),
      metadata: z.json(),
    })
    .parse(input);
  await append(store, `media/${media.id}`, actor, "metadata", {
    ...media,
    ...data,
  });
}
export async function deleteMedia(actor: string, id: string, store: Store) {
  const normalizedId = parsedId(id);
  const media = await getMedia(normalizedId, store);
  if (!media || media.deleted) throw new HttpError(404, "Media not found");
  const all = [
    ...(await records("articles", store)).map((record) => ({
      record,
      kind: "articles" as const,
    })),
    ...(await records("documents", store)).map((record) => ({
      record,
      kind: "documents" as const,
    })),
  ];
  if (
    all.some(
      ({ record: r, kind }) =>
        mediaReferences(r.draft, kind).includes(normalizedId) ||
        (r.published &&
          mediaReferences(r.published, kind).includes(normalizedId)),
    )
  )
    throw new HttpError(
      409,
      "This asset is referenced by content. Remove those references first.",
    );
  await append(store, `media/${media.id}`, actor, "delete", {
    ...media,
    deleted: true,
  });
  await store.remove(original(normalizedId));
  await store.remove(delivery(normalizedId));
}
export async function previewMedia(id: string, store: Store) {
  const media = await getMedia(id, store);
  if (!media || media.deleted) throw new HttpError(404, "Media not found");
  return store.signGet(original(id));
}
export async function publishMedia(
  content: unknown,
  store: Store,
  kind?: Kind,
) {
  await mapBounded(mediaReferences(content, kind), async (id) => {
    const media = await getMedia(id, store);
    if (!media?.ready || media.deleted)
      throw new HttpError(400, "Content references unavailable media");
    await store.copyPublic(original(id), delivery(id), media.contentType);
  });
}
export function resolvePublicMedia<T>(value: T, store: Store): T {
  function walk(item: unknown): unknown {
    if (typeof item === "string")
      return replaceMediaReferences(item, (id) =>
        store.publicUrl(delivery(id)),
      );
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item).map(([k, v]) => [k, walk(v)]),
      );
    return item;
  }
  return walk(value) as T;
}
