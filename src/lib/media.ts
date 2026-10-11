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
function validDimensions(width: number, height: number) {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= 100_000 &&
    height <= 100_000 &&
    width * height <= 250_000_000
  );
}

function uint16(bytes: Uint8Array, offset: number, littleEndian = false) {
  return littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1];
}

function uint24le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function uint32be(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function uint32le(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] +
    (bytes[offset + 1] << 8) +
    (bytes[offset + 2] << 16) +
    bytes[offset + 3] * 0x1000000
  );
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validJpeg(bytes: Uint8Array, suffix: Uint8Array) {
  if (
    bytes.length < 12 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    suffix.length < 2 ||
    suffix.at(-2) !== 0xff ||
    suffix.at(-1) !== 0xd9
  )
    return false;
  let offset = 2;
  let frame = false;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) return false;
    if (marker === 0xda) {
      if (!frame || offset + 2 > bytes.length) return false;
      const scanLength = uint16(bytes, offset);
      return scanLength >= 6 && offset + scanLength <= bytes.length;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return false;
    const length = uint16(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return false;
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      if (length < 8) return false;
      const height = uint16(bytes, offset + 3);
      const width = uint16(bytes, offset + 5);
      if (!validDimensions(width, height)) return false;
      frame = true;
    }
    offset += length;
  }
  return false;
}

function validPng(bytes: Uint8Array, suffix: Uint8Array, size: number) {
  if (
    bytes.length < 33 ||
    size < 57 ||
    ![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, index) => bytes[index] === byte,
    ) ||
    uint32be(bytes, 8) !== 13 ||
    !asciiAt(bytes, 12, "IHDR") ||
    suffix.length < 12 ||
    uint32be(suffix, suffix.length - 12) !== 0 ||
    !asciiAt(suffix, suffix.length - 8, "IEND") ||
    suffix.at(-4) !== 0xae ||
    suffix.at(-3) !== 0x42 ||
    suffix.at(-2) !== 0x60 ||
    suffix.at(-1) !== 0x82 ||
    uint32be(suffix, suffix.length - 4) !== 0xae426082
  )
    return false;
  const width = uint32be(bytes, 16);
  const height = uint32be(bytes, 20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const allowedDepths: Record<number, number[]> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  if (
    !validDimensions(width, height) ||
    !allowedDepths[colorType]?.includes(bitDepth) ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    (bytes[28] !== 0 && bytes[28] !== 1) ||
    uint32be(bytes, 29) !== crc32(bytes.subarray(12, 29))
  )
    return false;

  let offset = 8;
  let sawImageData = false;
  while (offset + 8 <= bytes.length) {
    const chunkLength = uint32be(bytes, offset);
    const chunkType = new TextDecoder().decode(
      bytes.subarray(offset + 4, offset + 8),
    );
    if (chunkLength > size - offset - 12) return false;
    if (chunkType === "IHDR") {
      if (offset !== 8 || chunkLength !== 13) return false;
    } else if (chunkType === "IDAT") {
      if (chunkLength < 1) return false;
      sawImageData = true;
    } else if (chunkType === "IEND") {
      return chunkLength === 0 && sawImageData;
    }
    const crcOffset = offset + 8 + chunkLength;
    if (crcOffset + 4 > bytes.length)
      return chunkType === "IDAT" && sawImageData;
    if (
      uint32be(bytes, crcOffset) !==
      crc32(bytes.subarray(offset + 4, crcOffset))
    )
      return false;
    offset = crcOffset + 4;
  }
  return false;
}

function validWebp(bytes: Uint8Array, size: number) {
  if (
    bytes.length < 20 ||
    size < 20 ||
    !asciiAt(bytes, 0, "RIFF") ||
    !asciiAt(bytes, 8, "WEBP") ||
    uint32le(bytes, 4) !== size - 8
  )
    return false;
  function imageChunk(type: string, dataOffset: number, chunkSize: number) {
    if (type === "VP8L") {
      if (chunkSize < 5 || dataOffset + 5 > bytes.length) return false;
      if (bytes[dataOffset] !== 0x2f) return false;
      const width =
        1 + bytes[dataOffset + 1] + ((bytes[dataOffset + 2] & 0x3f) << 8);
      const height =
        1 +
        (bytes[dataOffset + 2] >> 6) +
        (bytes[dataOffset + 3] << 2) +
        ((bytes[dataOffset + 4] & 0x0f) << 10);
      return validDimensions(width, height);
    }
    if (type === "VP8 ") {
      if (chunkSize < 10 || dataOffset + 10 > bytes.length) return false;
      if (
        bytes[dataOffset + 3] !== 0x9d ||
        bytes[dataOffset + 4] !== 0x01 ||
        bytes[dataOffset + 5] !== 0x2a
      )
        return false;
      return validDimensions(
        uint16(bytes, dataOffset + 6, true) & 0x3fff,
        uint16(bytes, dataOffset + 8, true) & 0x3fff,
      );
    }
    return false;
  }

  let offset = 12;
  while (offset + 8 <= bytes.length && offset + 8 <= size) {
    const type = new TextDecoder().decode(bytes.subarray(offset, offset + 4));
    const chunkSize = uint32le(bytes, offset + 4);
    const dataOffset = offset + 8;
    if (chunkSize > size - dataOffset) return false;
    const paddedEnd = dataOffset + chunkSize + (chunkSize % 2);
    if (paddedEnd > size) return false;

    if (type === "VP8X") {
      if (chunkSize < 10 || dataOffset + 10 > bytes.length) return false;
      if (
        !validDimensions(
          uint24le(bytes, dataOffset + 4) + 1,
          uint24le(bytes, dataOffset + 7) + 1,
        )
      )
        return false;
    } else if (type === "VP8 " || type === "VP8L") {
      return imageChunk(type, dataOffset, chunkSize);
    } else if (type === "ANMF") {
      const frameEnd = dataOffset + chunkSize;
      let nested = dataOffset + 16;
      if (chunkSize < 24 || nested + 8 > bytes.length) return false;
      while (nested + 8 <= frameEnd && nested + 8 <= bytes.length) {
        const nestedType = new TextDecoder().decode(
          bytes.subarray(nested, nested + 4),
        );
        const nestedSize = uint32le(bytes, nested + 4);
        const nestedData = nested + 8;
        if (nestedSize > frameEnd - nestedData) return false;
        if (nestedType === "VP8 " || nestedType === "VP8L")
          return imageChunk(nestedType, nestedData, nestedSize);
        nested = nestedData + nestedSize + (nestedSize % 2);
      }
      return false;
    }

    // Very large leading metadata cannot be inspected with the bounded prefix.
    // Reject it rather than accepting a header-only file without image data.
    if (paddedEnd > bytes.length) return false;
    offset = paddedEnd;
  }
  return false;
}

function validGif(bytes: Uint8Array, suffix: Uint8Array, size: number) {
  if (
    bytes.length < 14 ||
    (!asciiAt(bytes, 0, "GIF87a") && !asciiAt(bytes, 0, "GIF89a")) ||
    suffix.at(-1) !== 0x3b ||
    !validDimensions(uint16(bytes, 6, true), uint16(bytes, 8, true))
  )
    return false;
  const packed = bytes[10];
  let offset = 13 + (packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0);
  if (offset >= bytes.length) return false;
  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) return offset === bytes.length;
    if (marker === 0x2c) {
      if (offset + 9 > bytes.length) return false;
      const width = uint16(bytes, offset + 4, true);
      const height = uint16(bytes, offset + 6, true);
      if (!validDimensions(width, height)) return false;
      const descriptorFlags = bytes[offset + 8];
      offset += 9;
      if (descriptorFlags & 0x80)
        offset += 3 * 2 ** ((descriptorFlags & 0x07) + 1);
      if (offset + 2 > bytes.length || bytes[offset] > 12) return false;
      offset++;
      const imageDataSize = bytes[offset];
      return (
        imageDataSize > 0 &&
        offset + 1 + imageDataSize <= size &&
        offset + 1 + imageDataSize <= bytes.length
      );
    } else if (marker === 0x21) {
      if (offset >= bytes.length) return false;
      offset++;
    } else {
      return false;
    }
    let terminated = false;
    while (offset < bytes.length) {
      const blockLength = bytes[offset++];
      if (blockLength === 0) {
        terminated = true;
        break;
      }
      if (offset + blockLength > bytes.length) return false;
      offset += blockLength;
    }
    if (!terminated) return false;
  }
  return false;
}

function validMp4(bytes: Uint8Array, size: number) {
  if (bytes.length < 24 || size < 24 || !asciiAt(bytes, 4, "ftyp"))
    return false;
  const ftypSize = uint32be(bytes, 0);
  if (
    ftypSize < 16 ||
    ftypSize > size ||
    ftypSize + 8 > bytes.length ||
    ![...bytes.subarray(8, 12)].every((byte) => byte >= 0x20 && byte <= 0x7e)
  )
    return false;
  const nextSize = uint32be(bytes, ftypSize);
  const nextType = new TextDecoder().decode(
    bytes.subarray(ftypSize + 4, ftypSize + 8),
  );
  const validNextType = new Set([
    "mdat",
    "moov",
    "free",
    "skip",
    "wide",
    "moof",
    "sidx",
  ]);
  return (
    validNextType.has(nextType) &&
    (nextSize === 0 ||
      (nextSize >= 8 &&
        nextSize <= size - ftypSize &&
        ftypSize + nextSize <= size))
  );
}

function readEbmlVint(bytes: Uint8Array, offset: number, keepMarker = false) {
  if (offset >= bytes.length || bytes[offset] === 0) return null;
  let mask = 0x80;
  let length = 1;
  while (!(bytes[offset] & mask) && length <= 8) {
    mask >>= 1;
    length++;
  }
  if (length > 8 || offset + length > bytes.length) return null;
  let value = keepMarker ? bytes[offset] : bytes[offset] & (mask - 1);
  for (let index = 1; index < length; index++)
    value = value * 256 + bytes[offset + index];
  return { length, value };
}

function validWebm(bytes: Uint8Array, size: number) {
  if (
    bytes.length < 18 ||
    size < 18 ||
    bytes[0] !== 0x1a ||
    bytes[1] !== 0x45 ||
    bytes[2] !== 0xdf ||
    bytes[3] !== 0xa3
  )
    return false;
  const headerSize = readEbmlVint(bytes, 4);
  if (!headerSize || headerSize.value > bytes.length - 4) return false;
  let offset = 4 + headerSize.length;
  const headerEnd = offset + headerSize.value;
  let hasWebmDocType = false;
  while (offset < headerEnd) {
    const id = readEbmlVint(bytes, offset, true);
    if (!id) return false;
    offset += id.length;
    const length = readEbmlVint(bytes, offset);
    if (!length || length.value > headerEnd - offset - length.length)
      return false;
    offset += length.length;
    if (id.value === 0x4282) {
      hasWebmDocType = length.value === 4 && asciiAt(bytes, offset, "webm");
    }
    offset += length.value;
  }
  if (!hasWebmDocType || headerEnd + 5 > bytes.length) return false;
  return (
    bytes[headerEnd] === 0x18 &&
    bytes[headerEnd + 1] === 0x53 &&
    bytes[headerEnd + 2] === 0x80 &&
    bytes[headerEnd + 3] === 0x67 &&
    !!readEbmlVint(bytes, headerEnd + 4)
  );
}

function hasValidMediaStructure(
  contentType: string,
  prefix: Uint8Array,
  suffix: Uint8Array,
  size: number,
) {
  switch (contentType) {
    case "image/jpeg":
      return validJpeg(prefix, suffix);
    case "image/png":
      return validPng(prefix, suffix, size);
    case "image/webp":
      return validWebp(prefix, size);
    case "image/gif":
      return validGif(prefix, suffix, size);
    case "video/mp4":
      return validMp4(prefix, size);
    case "video/webm":
      return validWebm(prefix, size);
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
