import { manageHandler } from "@/lib/manage-api";
import { readOrChangeContent } from "@/lib/manage-content";

type Context = { params: Promise<{ projectId: string; slug: string }> };

const handle = manageHandler(async (request: Request, context: Context) => {
  const { projectId, slug } = await context.params;
  return readOrChangeContent(request, projectId, "articles", slug);
});

export const GET = handle;
export const PUT = handle;
export const POST = handle;
