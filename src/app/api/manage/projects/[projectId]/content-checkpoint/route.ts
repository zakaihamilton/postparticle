import {
  contentIndexStatus,
  rebuildContentCheckpoints,
} from "@/lib/content-state";
import { json } from "@/lib/http";
import { manageHandler, manageProject } from "@/lib/manage-api";

type Context = { params: Promise<{ projectId: string }> };

export const POST = manageHandler(
  async (request: Request, context: Context) => {
    const { projectId } = await context.params;
    const { store } = await manageProject(request, projectId, true);
    const result = await rebuildContentCheckpoints("articles", store);
    const status = await contentIndexStatus("articles", store);

    if (!result.complete) return json({ complete: false, result, status }, 503);

    return json({ complete: true, result, status });
  },
);
