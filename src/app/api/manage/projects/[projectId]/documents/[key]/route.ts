import { manageHandler } from "@/lib/manage-api";
import { readOrChangeContent } from "@/lib/manage-content";

type Context = { params: Promise<{ projectId: string; key: string }> };

const handle = manageHandler(async (request: Request, context: Context) => {
  const { projectId, key } = await context.params;
  return readOrChangeContent(request, projectId, "documents", key);
});

export const GET = handle;
export const PUT = handle;
export const POST = handle;
