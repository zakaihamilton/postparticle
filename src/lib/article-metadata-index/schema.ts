import "server-only";
import type { Store } from "../storage";
import type { Article, PublicArticleMetadata, RecordState } from "../types";

export const indexPrefix = "indexes/public-article-metadata";
export const generationsPrefix = `${indexPrefix}/generations/`;
export const legacyEntriesPrefix = `${indexPrefix}/entries/`;
export const canonicalEntriesPrefix = `${legacyEntriesPrefix}by-slug/`;
export const manifestKey = `${indexPrefix}/manifest.json`;
export const indexVersion = 2;
export const firstPageSize = 100;
export const pageShardSize = 256;
export const retainedPreviousGenerations = 2;
export const rebuildRetries = 2;
export const generationOrphanGraceMs = 24 * 60 * 60 * 1000;

export type Order = "asc" | "desc";

export interface MetadataIndexManifest {
  version: number;
  generation: string;
  builtAt: string;
  total: number;
  firstPage: Record<Order, PublicArticleMetadata[]>;
  previousGenerations: Array<{ generation: string; total: number }>;
}

export interface MetadataPageShard {
  version: number;
  generation: string;
  order: Order;
  index: number;
  items: PublicArticleMetadata[];
}

export interface CanonicalMetadataEntry {
  version: number;
  slug: string;
  sourceEventId: string;
  metadata: PublicArticleMetadata | null;
}

export function publicMetadata(
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

export function metadataForArticle(
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

export function sortedMetadata(items: PublicArticleMetadata[], order: Order) {
  return [...items].sort((a, b) => {
    const byDate = a.articleDate.localeCompare(b.articleDate);
    return (order === "asc" ? byDate : -byDate) || a.slug.localeCompare(b.slug);
  });
}

export function isMetadata(value: unknown): value is PublicArticleMetadata {
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

export function isManifest(value: unknown): value is MetadataIndexManifest {
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

export function shardCount(total: number) {
  return Math.ceil(Math.max(0, total - firstPageSize) / pageShardSize);
}

export function pageShardKey(generation: string, order: Order, index: number) {
  return `${generationsPrefix}${generation}/pages/${order}/shard-${String(index).padStart(5, "0")}.json`;
}

export function canonicalEntryKey(slug: string) {
  return `${canonicalEntriesPrefix}${encodeURIComponent(slug)}.json`;
}

export function isCanonicalEntry(
  value: unknown,
): value is CanonicalMetadataEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CanonicalMetadataEntry>;
  return (
    entry.version === indexVersion &&
    typeof entry.slug === "string" &&
    typeof entry.sourceEventId === "string" &&
    (entry.metadata === null || isMetadata(entry.metadata))
  );
}

export function makePageShards(
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

export function isPageShard(
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
