import "server-only";
import { randomUUID } from "node:crypto";
import { HttpError } from "./config";
import { events as readEvents } from "./events";
import type {
  Article,
  Content,
  PublicArticleMetadata,
  PublicArticleMetadataIndexStatus,
  RecordState,
} from "./types";
import { readContentRecord, readContentRecords } from "./content-state";
import { mapBounded, type Store } from "./storage";

const indexPrefix = "indexes/public-article-metadata";
const generationsPrefix = `${indexPrefix}/generations/`;
const legacyEntriesPrefix = `${indexPrefix}/entries/`;
const canonicalEntriesPrefix = `${legacyEntriesPrefix}by-slug/`;
const manifestKey = `${indexPrefix}/manifest.json`;
const indexVersion = 2;
const firstPageSize = 100;
const pageShardSize = 256;
const retainedPreviousGenerations = 2;
const rebuildRetries = 2;
const generationOrphanGraceMs = 24 * 60 * 60 * 1000;

type Order = "asc" | "desc";
interface MetadataIndexManifest {
  version: number;
  generation: string;
  builtAt: string;
  total: number;
  firstPage: Record<Order, PublicArticleMetadata[]>;
  previousGenerations: Array<{ generation: string; total: number }>;
}
interface MetadataPageShard {
  version: number;
  generation: string;
  order: Order;
  index: number;
  items: PublicArticleMetadata[];
}
interface CanonicalMetadataEntry {
  version: number;
  slug: string;
  sourceEventId: string;
  metadata: PublicArticleMetadata | null;
}

function publicMetadata(
  record: RecordState,
  store: Store,
): PublicArticleMetadata | null {
  if (!record.published || record.trashed || !record.publishedAt) return null;
  return metadataForArticle(
    record.published as Article,
    record.createdAt,
    record.publishedAt,
    store,
  );
}

function metadataForArticle(
  article: Article,
  createdAt: string,
  publishedAt: string,
  store: Store,
): PublicArticleMetadata {
  const mediaUrl = (id: string) =>
    id ? store.publicUrl(`public/media/${id.toLowerCase()}/asset`) : null;
  return {
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    author: article.author,
    tags: article.tags,
    articleDate: article.articleDate,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    createdAt,
    updatedAt: publishedAt,
    publishedAt,
    coverUrl: mediaUrl(article.coverMediaId),
    socialImageUrl: mediaUrl(article.socialMediaId),
  };
}

function sortedMetadata(items: PublicArticleMetadata[], order: Order) {
  return [...items].sort((a, b) => {
    const byDate = a.articleDate.localeCompare(b.articleDate);
    return (order === "asc" ? byDate : -byDate) || a.slug.localeCompare(b.slug);
  });
}

function isMetadata(value: unknown): value is PublicArticleMetadata {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PublicArticleMetadata>;
  return (
    typeof item.title === "string" &&
    typeof item.slug === "string" &&
    typeof item.excerpt === "string" &&
    typeof item.author === "string" &&
    Array.isArray(item.tags) &&
    item.tags.every((tag) => typeof tag === "string") &&
    typeof item.articleDate === "string" &&
    typeof item.seoTitle === "string" &&
    typeof item.seoDescription === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string" &&
    typeof item.publishedAt === "string" &&
    (typeof item.coverUrl === "string" || item.coverUrl === null) &&
    (typeof item.socialImageUrl === "string" || item.socialImageUrl === null)
  );
}

function isManifest(value: unknown): value is MetadataIndexManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<MetadataIndexManifest>;
  return (
    manifest.version === indexVersion &&
    typeof manifest.generation === "string" &&
    /^\d{13}-[0-9a-f-]{36}$/.test(manifest.generation) &&
    typeof manifest.builtAt === "string" &&
    Number.isFinite(Date.parse(manifest.builtAt)) &&
    Number.isSafeInteger(manifest.total) &&
    manifest.total! >= 0 &&
    !!manifest.firstPage &&
    ["asc", "desc"].every((order) => {
      const items = manifest.firstPage?.[order as Order];
      return (
        Array.isArray(items) &&
        items.length === Math.min(manifest.total!, firstPageSize) &&
        items.every(isMetadata)
      );
    }) &&
    Array.isArray(manifest.previousGenerations) &&
    manifest.previousGenerations.every(
      (generation) =>
        !!generation &&
        typeof generation.generation === "string" &&
        Number.isSafeInteger(generation.total) &&
        generation.total >= 0,
    )
  );
}

function shardCount(total: number) {
  return Math.ceil(Math.max(0, total - firstPageSize) / pageShardSize);
}

function pageShardKey(generation: string, order: Order, index: number) {
  return `${generationsPrefix}${generation}/pages/${order}/shard-${String(index).padStart(5, "0")}.json`;
}

function canonicalEntryKey(slug: string) {
  return `${canonicalEntriesPrefix}${encodeURIComponent(slug)}.json`;
}

function isCanonicalEntry(value: unknown): value is CanonicalMetadataEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CanonicalMetadataEntry>;
  return (
    entry.version === indexVersion &&
    typeof entry.slug === "string" &&
    typeof entry.sourceEventId === "string" &&
    (entry.metadata === null || isMetadata(entry.metadata))
  );
}

function makePageShards(
  generation: string,
  items: PublicArticleMetadata[],
  order: Order,
) {
  const tail = items.slice(firstPageSize);
  const shards: Array<{ key: string; value: MetadataPageShard }> = [];
  for (
    let offset = 0, index = 0;
    offset < tail.length;
    offset += pageShardSize, index++
  ) {
    shards.push({
      key: pageShardKey(generation, order, index),
      value: {
        version: indexVersion,
        generation,
        order,
        index,
        items: tail.slice(offset, offset + pageShardSize),
      },
    });
  }
  return shards;
}

function isPageShard(
  value: unknown,
  generation: string,
  order: Order,
  index: number,
  expectedItems: number,
): value is MetadataPageShard {
  if (!value || typeof value !== "object") return false;
  const shard = value as Partial<MetadataPageShard>;
  return (
    shard.version === indexVersion &&
    shard.generation === generation &&
    shard.order === order &&
    shard.index === index &&
    Array.isArray(shard.items) &&
    shard.items.length === expectedItems &&
    shard.items.every(isMetadata)
  );
}

async function readManifest(store: Store) {
  const value = await store.get<unknown>(manifestKey);
  return isManifest(value) ? value : null;
}

export async function publicArticleMetadataIndexStatus(
  store: Store,
): Promise<PublicArticleMetadataIndexStatus> {
  const manifest = await readManifest(store);
  return {
    ready: !!manifest,
    total: manifest?.total ?? null,
    builtAt: manifest?.builtAt ?? null,
  };
}

async function removeGeneration(
  store: Store,
  generation: { generation: string; total: number },
) {
  const keys = (["asc", "desc"] as const).flatMap((order) =>
    Array.from({ length: shardCount(generation.total) }, (_, index) =>
      pageShardKey(generation.generation, order, index),
    ),
  );
  await mapBounded(keys, (key) => store.remove(key));
}

async function writeSnapshot(
  store: Store,
  sourceItems: PublicArticleMetadata[],
  previous: MetadataIndexManifest | null,
) {
  const generation = `${Date.now().toString().padStart(13, "0")}-${randomUUID()}`;
  const asc = sortedMetadata(sourceItems, "asc");
  const desc = sortedMetadata(sourceItems, "desc");
  const shards = [
    ...makePageShards(generation, asc, "asc"),
    ...makePageShards(generation, desc, "desc"),
  ];

  const writeFailures = await mapBounded(shards, async ({ key, value }) => {
    try {
      await store.put(key, value);
      const saved = await store.get<unknown>(key);
      if (
        !isPageShard(
          saved,
          generation,
          value.order,
          value.index,
          value.items.length,
        )
      )
        throw new Error("Public article metadata page shard failed read-back");
      return null;
    } catch (error) {
      return error;
    }
  });
  const failure = writeFailures.find((error) => error !== null);
  if (failure) {
    await removeGeneration(store, {
      generation,
      total: sourceItems.length,
    }).catch(() => undefined);
    throw failure;
  }

  const prior = previous
    ? [
        { generation: previous.generation, total: previous.total },
        ...previous.previousGenerations,
      ]
    : [];
  const retained = prior.slice(0, retainedPreviousGenerations);
  const manifest: MetadataIndexManifest = {
    version: indexVersion,
    generation,
    builtAt: new Date().toISOString(),
    total: sourceItems.length,
    firstPage: {
      asc: asc.slice(0, firstPageSize),
      desc: desc.slice(0, firstPageSize),
    },
    previousGenerations: retained,
  };

  try {
    // This single object is the commit point for total, first page, and shard generation.
    await store.put(manifestKey, manifest);
  } catch (error) {
    await removeGeneration(store, {
      generation,
      total: sourceItems.length,
    }).catch(() => undefined);
    throw error;
  }

  const pruned = prior.slice(retainedPreviousGenerations);
  await Promise.all(
    pruned.map((old) => removeGeneration(store, old).catch(() => undefined)),
  );
  return manifest;
}

function sameKeys(a: string[], b: string[]) {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

const metadataWriteQueues = new Map<string, Promise<void>>();
const storeLockIds = new WeakMap<object, string>();
let nextStoreLockId = 0;

function storeLockKey(store: Store) {
  try {
    return store.publicUrl(manifestKey);
  } catch {
    let id = storeLockIds.get(store as object);
    if (!id) {
      id = `store-${++nextStoreLockId}`;
      storeLockIds.set(store as object, id);
    }
    return id;
  }
}

async function withMetadataWriteLock<T>(store: Store, task: () => Promise<T>) {
  const key = storeLockKey(store);
  const previous = metadataWriteQueues.get(key) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);
  metadataWriteQueues.set(key, queued);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (metadataWriteQueues.get(key) === queued)
      metadataWriteQueues.delete(key);
  }
}

function contentArticleKeys(keys: string[]) {
  return keys.filter((key) => key.endsWith(".json"));
}

async function pruneOldGenerations(
  store: Store,
  manifest: MetadataIndexManifest,
) {
  const retained = new Set([
    manifest.generation,
    ...manifest.previousGenerations.map((item) => item.generation),
  ]);
  const keys = await store.list(generationsPrefix);
  const oldKeys = keys.filter((key) => {
    const generation = key.slice(generationsPrefix.length).split("/", 1)[0];
    if (!generation || retained.has(generation)) return false;
    const timestamp = Number(generation.slice(0, 13));
    return (
      !Number.isFinite(timestamp) ||
      Date.now() - timestamp > generationOrphanGraceMs
    );
  });
  await mapBounded(oldKeys, (key) => store.remove(key));
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

async function readPageShard(
  store: Store,
  manifest: MetadataIndexManifest,
  order: Order,
  index: number,
) {
  const expectedItems = Math.min(
    pageShardSize,
    manifest.total - firstPageSize - index * pageShardSize,
  );
  const value = await store.get<unknown>(
    pageShardKey(manifest.generation, order, index),
  );
  if (!isPageShard(value, manifest.generation, order, index, expectedItems))
    throw new HttpError(
      503,
      "Storage is temporarily unavailable. Please retry.",
    );
  return value.items;
}

export async function listIndexedPublicArticleMetadata(
  query: { order: Order; page: number; pageSize: number },
  store: Store,
): Promise<{
  items: PublicArticleMetadata[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const manifest = await readManifest(store);
  if (!manifest)
    throw new HttpError(
      503,
      "Storage is temporarily unavailable. Please retry.",
    );

  const start = (query.page - 1) * query.pageSize;
  const end = Math.min(start + query.pageSize, manifest.total);
  if (start >= manifest.total)
    return {
      items: [],
      total: manifest.total,
      page: query.page,
      pageSize: query.pageSize,
    };

  const result: PublicArticleMetadata[] = [];
  let cursor = start;
  if (cursor < firstPageSize) {
    const firstEnd = Math.min(end, firstPageSize);
    result.push(...manifest.firstPage[query.order].slice(cursor, firstEnd));
    cursor = firstEnd;
  }
  if (cursor < end) {
    const firstShard = Math.floor((cursor - firstPageSize) / pageShardSize);
    const lastShard = Math.floor((end - 1 - firstPageSize) / pageShardSize);
    const shards = await mapBounded(
      Array.from(
        { length: lastShard - firstShard + 1 },
        (_, index) => firstShard + index,
      ),
      (index) => readPageShard(store, manifest, query.order, index),
    );
    for (let index = firstShard; index <= lastShard; index++) {
      const shardItems = shards[index - firstShard];
      const shardStart = firstPageSize + index * pageShardSize;
      const from = Math.max(cursor, shardStart) - shardStart;
      const to = Math.min(end, shardStart + shardItems.length) - shardStart;
      result.push(...shardItems.slice(from, to));
      cursor = shardStart + to;
    }
  }

  if (result.length !== end - start)
    throw new HttpError(
      503,
      "Storage is temporarily unavailable. Please retry.",
    );
  return {
    items: result,
    total: manifest.total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
