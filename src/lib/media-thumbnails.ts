import "server-only";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import { HttpError } from "./config";
import { getMedia, original, parsedId, thumbnail } from "./media";
import type { Store } from "./storage";
import type { Media } from "./types";

const thumbnailJobs = new WeakMap<Store, Map<string, Promise<string>>>();

function isMissingObject(error: unknown) {
  if (error instanceof HttpError && error.status === 404) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    ["NoSuchKey", "NotFound"].includes(String(candidate.name)) ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

export async function ensureMediaThumbnail(
  id: string,
  media: Media,
  store: Store,
) {
  const normalizedId = parsedId(id);
  if (!media.contentType.startsWith("image/"))
    throw new HttpError(415, "Only images have previews");

  let jobs = thumbnailJobs.get(store);
  if (!jobs) {
    jobs = new Map();
    thumbnailJobs.set(store, jobs);
  }
  const existingJob = jobs.get(normalizedId);
  if (existingJob) return existingJob;

  const key = thumbnail(normalizedId);
  const job = (async () => {
    try {
      if ((await store.head(key)).size > 0) return key;
    } catch (error) {
      if (!isMissingObject(error)) throw error;
    }

    const source = await store.readStream(original(normalizedId));
    const processor = sharp({ limitInputPixels: 250_000_000 })
      .rotate()
      .resize(480, 360, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 76, effort: 4 });
    const chunks: Buffer[] = [];
    const collect = (async () => {
      for await (const chunk of processor) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    })();
    const [, preview] = await Promise.all([
      pipeline(source, processor),
      collect,
    ]);
    await store.writeBytes(key, preview, "image/webp", "private, max-age=900");
    return key;
  })();
  jobs.set(normalizedId, job);
  try {
    return await job;
  } finally {
    if (jobs.get(normalizedId) === job) jobs.delete(normalizedId);
  }
}

export async function mediaThumbnailUrl(id: string, store: Store) {
  const media = await getMedia(id, store);
  if (!media || media.deleted || !media.ready)
    throw new HttpError(404, "Media not found");
  return store.signGet(await ensureMediaThumbnail(id, media, store), 900);
}
