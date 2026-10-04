import { manageHandler } from "@/lib/manage-api";
import { readContentHistory } from "@/lib/manage-content";

type Context = { params: Promise<{ projectId: string; slug: string }> };

export const GET = manageHandler(async (request: Request, context: Context) => {
  const { projectId, slug } = await context.params;
  return readContentHistory(request, projectId, "articles", slug);
});
