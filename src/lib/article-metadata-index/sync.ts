import "server-only";
import { readContentRecord, readContentRecords } from "../content-state";
import { events as readEvents } from "../events";
import { mapBounded, type Store } from "../storage";
import type { Article, Content } from "../types";
import {
  type CanonicalMetadataEntry,
  canonicalEntriesPrefix,
  canonicalEntryKey,
  indexVersion,
  isCanonicalEntry,
  legacyEntriesPrefix,
  manifestKey,
  publicMetadata,
  rebuildRetries,
  shardCount,
} from "./schema";
import {
  pruneOldGenerations,
  readManifest,
  removeGeneration,
  withMetadataWriteLock,
  writeSnapshot,
} from "./snapshot-store";

function sameKeys(a: string[], b: string[]) {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

function contentArticleKeys(keys: string[]) {
  return keys.filter((key) => key.endsWith(".json"));
}

/** Rebuilds the derived metadata snapshot from source records for operator migration/recovery. */
async function rebuildPublicArticleMetadataIndexUnlocked(store: Store) {
  let lastError: unknown = new Error(
    "Article source changed while the metadata snapshot was being built",
  );
  for (let attempt = 0; attempt <= rebuildRetries; attempt++) {
    const before = contentArticleKeys(await store.list("content/articles/"));
    const records = await readContentRecords("articles", store);
    const afterRead = contentArticleKeys(await store.list("content/articles/"));
    if (!sameKeys(before, afterRead)) {
      lastError = new Error(
        "Article source changed while the metadata snapshot was being built",
      );
      continue;
    }

    const entries = (
      await mapBounded(records, async (record) => {
        const history = await readEvents<Content>(
          store,
          `content/articles/${record.id}`,
        );
        const latestEvent = history.at(-1);
        if (!latestEvent) return null;
        return {
          version: indexVersion,
          slug: record.id,
          sourceEventId: latestEvent.id,
          metadata: publicMetadata(record, store),
        } satisfies CanonicalMetadataEntry;
      })
    ).filter((entry): entry is CanonicalMetadataEntry => !!entry);
    const items = entries.flatMap((entry) =>
      entry.metadata ? [entry.metadata] : [],
    );
    const expectedEntryKeys = new Set(
      entries.map((entry) => canonicalEntryKey(entry.slug)),
    );
    const oldEntryKeys = await store.list(canonicalEntriesPrefix);
    await mapBounded(
      oldEntryKeys.filter((key) => !expectedEntryKeys.has(key)),
      (key) => store.remove(key),
    );
    await mapBounded(entries, (entry) =>
      store.put(canonicalEntryKey(entry.slug), entry),
    );
    const previous = await readManifest(store);
    const manifest = await writeSnapshot(store, items, previous);
    const afterWrite = contentArticleKeys(
      await store.list("content/articles/"),
    );
    if (sameKeys(before, afterWrite)) {
      await pruneOldGenerations(store, manifest).catch(() => undefined);
      const legacyKeys = (await store.list(legacyEntriesPrefix)).filter(
        (key) => !key.startsWith(canonicalEntriesPrefix),
      );
      await mapBounded(legacyKeys, (key) => store.remove(key)).catch(
        () => undefined,
      );
      return {
        generation: manifest.generation,
        total: manifest.total,
        pageShards: shardCount(manifest.total) * 2,
        retries: attempt,
      };
    }

    lastError = new Error(
      "Article source changed while the metadata snapshot was being built",
    );
    const active = await readManifest(store).catch(() => null);
    if (active?.generation === manifest.generation)
      await store.remove(manifestKey).catch(() => undefined);
    await removeGeneration(store, manifest).catch(() => undefined);
  }
  throw lastError;
}

export function rebuildPublicArticleMetadataIndex(store: Store) {
  return withMetadataWriteLock(store, () =>
    rebuildPublicArticleMetadataIndexUnlocked(store),
  );
}

async function readCanonicalEntries(store: Store) {
  const keys = await store.list(canonicalEntriesPrefix);
  const entries = await mapBounded(keys, async (key) => {
    const value = await store.get<unknown>(key);
    if (!isCanonicalEntry(value))
      throw new Error("Public article metadata entry is incomplete");
    const encodedSlug = key.slice(canonicalEntriesPrefix.length, -5);
    if (decodeURIComponent(encodedSlug) !== value.slug)
      throw new Error("Public article metadata entry key is inconsistent");
    return value;
  });
  return entries.sort((a, b) => a.slug.localeCompare(b.slug));
}

function metadataFingerprint(entries: CanonicalMetadataEntry[]) {
  return entries.map((entry) => JSON.stringify(entry)).join("\n");
}

async function currentCanonicalEntry(store: Store, slug: string) {
  const [state, history] = await Promise.all([
    readContentRecord("articles", slug, store),
    readEvents<Content>(store, `content/articles/${slug}`),
  ]);
  const latestEvent = history.at(-1);
  if (!state || !latestEvent)
    throw new Error("Article source record is unavailable");
  return {
    version: indexVersion,
    slug,
    sourceEventId: latestEvent.id,
    metadata: publicMetadata(state, store),
  } satisfies CanonicalMetadataEntry;
}

/** Keeps the public snapshot in step with a publish, unpublish, or trash event. */
export async function syncPublicArticleMetadata(
  store: Store,
  previous: Article | null,
  next: {
    article: Article;
    createdAt: string;
    publishedAt: string;
  } | null,
) {
  if (!previous && !next) return;
  return withMetadataWriteLock(store, async () => {
    try {
      let manifest = await readManifest(store);
      if (!manifest) {
        await rebuildPublicArticleMetadataIndexUnlocked(store);
        manifest = await readManifest(store);
      }
      if (!manifest)
        throw new Error("Public article metadata index unavailable");
      const slug = next?.article.slug ?? previous?.slug;
      if (!slug) return;
      const key = canonicalEntryKey(slug);
      let currentEntry = await currentCanonicalEntry(store, slug);

      for (let attempt = 0; attempt <= rebuildRetries; attempt++) {
        const existing = await store.get<unknown>(key);
        if (
          isCanonicalEntry(existing) &&
          existing.sourceEventId > currentEntry.sourceEventId
        ) {
          currentEntry = await currentCanonicalEntry(store, slug);
          continue;
        }
        await store.put(key, currentEntry);
        const verifiedEntry = await currentCanonicalEntry(store, slug);
        const savedEntry = await store.get<unknown>(key);
        if (
          !isCanonicalEntry(savedEntry) ||
          savedEntry.sourceEventId !== verifiedEntry.sourceEventId ||
          JSON.stringify(savedEntry.metadata) !==
            JSON.stringify(verifiedEntry.metadata)
        ) {
          currentEntry = verifiedEntry;
          continue;
        }

        const beforeEntries = await readCanonicalEntries(store);
        const before = metadataFingerprint(beforeEntries);
        const items = beforeEntries.flatMap((entry) =>
          entry.metadata ? [entry.metadata] : [],
        );
        manifest = await writeSnapshot(store, items, manifest);
        const afterEntries = await readCanonicalEntries(store);
        const latestEntry = await currentCanonicalEntry(store, slug);
        const savedAfter = afterEntries.find((entry) => entry.slug === slug);
        if (
          metadataFingerprint(afterEntries) === before &&
          savedAfter?.sourceEventId === latestEntry.sourceEventId &&
          JSON.stringify(savedAfter.metadata) ===
            JSON.stringify(latestEntry.metadata)
        )
          return;

        // A concurrent instance changed an entry while this generation was built.
        // Rebuild from the current canonical entry set before reporting success.
        currentEntry = latestEntry;
        manifest = (await readManifest(store)) ?? manifest;
      }
      throw new Error(
        "Public article metadata changed during concurrent updates",
      );
    } catch (error) {
      // Never serve a snapshot whose total or first page may no longer match the source events.
      await store.remove(manifestKey).catch(() => undefined);
      throw error;
    }
  });
}
