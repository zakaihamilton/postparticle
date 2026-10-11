import { manageHandler, manageProject } from "@/lib/manage-api";
import { records } from "@/lib/content";
import { json } from "@/lib/http";
import { listMedia } from "@/lib/media";
import type { Article } from "@/lib/types";

type Context = { params: Promise<{ projectId: string }> };

export const GET = manageHandler(async (request: Request, context: Context) => {
  const { projectId } = await context.params;
  const { store } = await manageProject(request, projectId);
  const [articleRecords, media] = await Promise.all([
    records("articles", store),
    listMedia(store),
  ]);
  const articles = articleRecords.filter((record) => !record.trashed);
  const recentArticles = [...articles]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)
    .map((record) => ({
      id: record.id,
      draft: {
        title: record.draft.title,
        author: (record.draft as Article).author,
        tags: record.draft.tags,
        articleDate: (record.draft as Article).articleDate,
      },
      published: !!record.published,
      trashed: record.trashed,
      updatedAt: record.updatedAt,
    }));
  return json({
    articleCount: articles.length,
    publishedCount: articles.filter((record) => record.published).length,
    mediaCount: media.length,
    recentArticles,
  });
});
