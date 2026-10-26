import "server-only";

import { records } from "./content";
import { readWorkspaceDashboardArticles } from "./content-state";
import { listMedia } from "./media";
import type { Store } from "./storage";
import type {
  Article,
  WorkspaceDashboard,
  WorkspaceDashboardArticle,
  WorkspaceDashboardResult,
} from "./types";

export async function readWorkspaceDashboard(
  store: Store,
): Promise<WorkspaceDashboard> {
  const [indexedArticles, media] = await Promise.all([
    readWorkspaceDashboardArticles(store),
    listMedia(store),
  ]);
  const articleRecords =
    indexedArticles ??
    (await records("articles", store)).map((record) => {
      const draft = record.draft as Article;
      return {
        id: record.id,
        draft: {
          title: draft.title,
          author: draft.author,
          tags: draft.tags,
          articleDate: draft.articleDate,
        },
        published: !!record.published,
        trashed: record.trashed,
        updatedAt: record.updatedAt,
      } satisfies WorkspaceDashboardArticle;
    });
  const articles = articleRecords.filter((record) => !record.trashed);
  const recentArticles = [...articles]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)
    .map((record) => record);

  return {
    articleCount: articles.length,
    publishedCount: articles.filter((record) => record.published).length,
    mediaCount: media.length,
    recentArticles,
  };
}

export async function readWorkspaceDashboardResult(
  store: Store,
): Promise<WorkspaceDashboardResult> {
  try {
    return { data: await readWorkspaceDashboard(store), error: "" };
  } catch (error) {
    console.error(
      "Workspace dashboard read failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return {
      data: null,
      error: "Workspace overview is temporarily unavailable.",
    };
  }
}
