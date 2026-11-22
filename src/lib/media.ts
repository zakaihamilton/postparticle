import "server-only";
import { z } from "zod";
import { HttpError } from "./config";
import { mediaReferences, records } from "./content";
import { append } from "./events";
import { replaceMediaReferences } from "./media-references";
import { mapBounded, type Store } from "./storage";
import type { Event, Kind, Media } from "./types";

export { ensureMediaThumbnail, mediaThumbnailUrl } from "./media-thumbnails";
export {
  abortUpload,
  finishUpload,
  signPart,
  startUpload,
  writeLocalUpload,
} from "./media-uploads";

export function parsedId(id: string) {
  return z.string().uuid().parse(id).toLowerCase();
}
export function original(id: string) {
  return `originals/${parsedId(id)}/asset`;
}
export function delivery(id: string) {
  return `public/media/${parsedId(id)}/asset`;
}
export function thumbnail(id: string) {
  return `previews/${parsedId(id)}/thumbnail.webp`;
}

interface MediaLibraryItem extends Media {
  previewUrl: string | null;
}

export interface MediaLibraryPage {
  items: MediaLibraryItem[];
  total: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
}

export async function getMedia(id: string, store: Store) {
  const prefix = `media/${parsedId(id)}/`;
  const key = (await store.list(prefix))
    .filter((item) => item.endsWith(".json"))
    .sort()
    .at(-1);
  if (!key) return null;
  return (await store.get<Event<Media>>(key))?.data ?? null;
}

export async function listMedia(store: Store) {
  const keys = (await store.list("media/")).sort();
  const latestKeys = new Map<string, string>();
  for (const key of keys) {
    const match = /^media\/([0-9a-f-]{36})\/[^/]+\.json$/i.exec(key);
    if (match) latestKeys.set(match[1].toLowerCase(), key);
  }
  const latestEvents = await mapBounded([...latestKeys.values()], (key) =>
    store.get<Event<Media>>(key),
  );
  return latestEvents
    .filter((event): event is Event<Media> => !!event)
    .map((event) => event.data)
    .filter((m) => !m.deleted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listMediaPage(
  store: Store,
  options: { offset: number; limit: number; query: string },
): Promise<MediaLibraryPage> {
  const matching = (await listMedia(store)).filter((item) =>
    item.filename.toLowerCase().includes(options.query.toLowerCase()),
  );
  const page = matching.slice(options.offset, options.offset + options.limit);
  // Keep the listing independent of image storage and conversion latency. The
  // browser loads each thumbnail lazily through the authenticated thumbnail route.
  const items: MediaLibraryItem[] = page.map((item) => ({
    ...item,
    previewUrl: null,
  }));
  const nextOffset = options.offset + items.length;
  return {
    items,
    total: matching.length,
    offset: options.offset,
    limit: options.limit,
    nextOffset: nextOffset < matching.length ? nextOffset : null,
  };
}

export async function mediaOriginalUrl(id: string, store: Store) {
  return store.signGet(original(id), 900);
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
  if (!media) throw new HttpError(404, "Media not found");
  if (!media.deleted) {
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
  }

  // Keep cleanup retryable after the tombstone is written. Attempt every object
  // even if one removal fails, then let the caller retry the DELETE request.
  const removals = await Promise.allSettled([
    store.remove(original(normalizedId)),
    store.remove(delivery(normalizedId)),
    store.remove(thumbnail(normalizedId)),
  ]);
  const failure = removals.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

export async function previewMedia(id: string, store: Store) {
  const media = await getMedia(id, store);
  if (!media || media.deleted) throw new HttpError(404, "Media not found");
  return store.signGet(original(id), 900);
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
