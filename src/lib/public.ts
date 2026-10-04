import "server-only";
import { z } from "zod";
import { HttpError } from "./config";
import { getRecord, records } from "./content";
import { delivery, resolvePublicMedia } from "./media";
import { projectStore, type Store } from "./storage";
import type {
  Article,
  ArticlePage,
  JsonDocument,
  PublicArticle,
  RecordState,
} from "./types";
function publicArticle(record: RecordState, store: Store): PublicArticle {
  const article = record.published as Article;
  const { coverMediaId, socialMediaId, ...fields } = resolvePublicMedia(
    article,
    store,
  );
  return {
    ...fields,
    createdAt: record.createdAt,
    updatedAt: record.publishedAt!,
    publishedAt: record.publishedAt!,
    coverUrl: coverMediaId ? store.publicUrl(delivery(coverMediaId)) : null,
    socialImageUrl: socialMediaId
      ? store.publicUrl(delivery(socialMediaId))
      : null,
  };
}
const querySchema = z.object({
  q: z.string().max(200).default(""),
  tag: z.string().max(60).default(""),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
});
export async function listPublicArticles(
  projectId: string,
  query: Record<string, string>,
  store = projectStore(projectId),
): Promise<ArticlePage> {
  const { q, tag, order, page, pageSize } = querySchema.parse(query);
  const needle = q.toLowerCase();
  const items = (await records("articles", store))
    .filter((r) => r.published && !r.trashed)
    .map((r) => publicArticle(r, store))
    .filter(
      (a) =>
        (!tag || a.tags.includes(tag.toLowerCase())) &&
        (!needle ||
          `${a.title} ${a.excerpt} ${a.body}`.toLowerCase().includes(needle)),
    )
    .sort((a, b) => {
      const dates =
        a.articleDate.localeCompare(b.articleDate) * (order === "asc" ? 1 : -1);
      return dates || a.slug.localeCompare(b.slug);
    });
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageSize,
  };
}
export async function readPublicArticle(projectId: string, slug: string) {
  const store = projectStore(projectId);
  const record = await getRecord("articles", slug, store);
  if (!record?.published || record.trashed)
    throw new HttpError(404, "Article not found");
  return publicArticle(record, store);
}
export async function readPublicDocument(projectId: string, key: string) {
  const store = projectStore(projectId);
  const record = await getRecord("documents", key, store);
  if (!record?.published || record.trashed)
    throw new HttpError(404, "Document not found");
  return resolvePublicMedia(record.published as JsonDocument, store);
}
