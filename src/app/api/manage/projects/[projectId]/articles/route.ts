import { manageHandler } from "@/lib/manage-api";
import { listOrCreateContent } from "@/lib/manage-content";

type Context = { params: Promise<{ projectId: string }> };

export const GET = manageHandler(async (request: Request, context: Context) =>
  listOrCreateContent(request, (await context.params).projectId, "articles"),
);

export const POST = manageHandler(async (request: Request, context: Context) =>
  listOrCreateContent(request, (await context.params).projectId, "articles"),
);
