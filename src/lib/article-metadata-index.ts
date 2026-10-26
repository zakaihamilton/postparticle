import "server-only";
import type { Article, PublicArticleMetadata, RecordState } from "./types";
import { readContentRecords } from "./content-state";
import { mapBounded, type Store } from "./storage";

const indexPrefix = "indexes/public-article-metadata";
const entriesPrefix = `${indexPrefix}/entries/`;
const manifestKey = `${indexPrefix}/manifest.json`;
const indexVersion = 1;

interface MetadataIndexManifest {
  version: number;
  builtAt: string;
}

function entryKey(article: Pick<Article, "articleDate" | "slug">) {
  return `${entriesPrefix}${article.articleDate}/${encodeURIComponent(article.slug)}.json`;
}

function publicMetadata(
  record: RecordState,
  store: Store,
): PublicArticleMetadata | null {
  if (!record.published || record.trashed) return null;

  const article = record.published as Article;
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
    createdAt: record.createdAt,
    updatedAt: record.publishedAt!,
    publishedAt: record.publishedAt!,
    coverUrl: mediaUrl(article.coverMediaId),
    socialImageUrl: mediaUrl(article.socialMediaId),
  };
}

/**
 * Creates the derived listing once for projects that predate this index.
 * Normal metadata requests then read only the index keys and the requested
 * metadata objects, never the article bodies.
 */
export async function ensurePublicArticleMetadataIndex(store: Store) {
  const manifest = await store.get<MetadataIndexManifest>(manifestKey);
  if (manifest?.version === indexVersion) return;

  const records = await readContentRecords("articles", store);
  const entries = records.flatMap((record) => {
    const metadata = publicMetadata(record, store);
    return metadata ? [{ metadata, key: entryKey(metadata) }] : [];
  });

  const previousEntries = await store.list(entriesPrefix);
  await mapBounded(previousEntries, (key) => store.remove(key));
  await mapBounded(entries, ({ metadata, key }) => store.put(key, metadata));
  await store.put(manifestKey, {
    version: indexVersion,
    builtAt: new Date().toISOString(),
  } satisfies MetadataIndexManifest);
}

/** Keeps the listing projection in step with a publish, unpublish, or trash event. */
export async function syncPublicArticleMetadata(
  store: Store,
  previous: Article | null,
  next: {
    article: Article;
    createdAt: string;
    publishedAt: string;
  } | null,
) {
  await ensurePublicArticleMetadataIndex(store);

  try {
    if (previous) await store.remove(entryKey(previous));
    if (next) {
      const metadata = publicMetadata(
        {
          id: next.article.slug,
          draft: next.article,
          published: next.article,
          trashed: false,
          createdAt: next.createdAt,
          updatedAt: next.publishedAt,
          publishedAt: next.publishedAt,
          revision: "",
        },
        store,
      );
      if (metadata) await store.put(entryKey(next.article), metadata);
    }
  } catch (error) {
    await store.remove(manifestKey).catch(() => undefined);
    throw error;
  }
}

function entryDetails(key: string) {
  const relative = key.slice(entriesPrefix.length);
  const separator = relative.indexOf("/");
  if (separator < 0 || !key.endsWith(".json")) return null;
  const articleDate = relative.slice(0, separator);
  let slug: string;
  try {
    slug = decodeURIComponent(relative.slice(separator + 1, -5));
  } catch {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(articleDate) || !slug) return null;
  return { articleDate, slug };
}

export async function listIndexedPublicArticleMetadata(
  query: { order: "asc" | "desc"; page: number; pageSize: number },
  store: Store,
): Promise<{
  items: PublicArticleMetadata[];
  total: number;
  page: number;
  pageSize: number;
}> {
  await ensurePublicArticleMetadataIndex(store);

  const entries = (await store.list(entriesPrefix))
    .flatMap((key) => {
      const details = entryDetails(key);
      return details ? [{ key, ...details }] : [];
    })
    .sort((a, b) => {
      const dateOrder = a.articleDate.localeCompare(b.articleDate);
      const orderedDate = query.order === "asc" ? dateOrder : -dateOrder;
      return orderedDate || a.slug.localeCompare(b.slug);
    });

  const start = (query.page - 1) * query.pageSize;
  const selected = entries.slice(start, start + query.pageSize);
  const items = (
    await mapBounded(selected, ({ key }) =>
      store.get<PublicArticleMetadata>(key),
    )
  ).filter((item): item is PublicArticleMetadata => item !== null);

  return {
    items,
    total: entries.length,
    page: query.page,
    pageSize: query.pageSize,
  };
}
