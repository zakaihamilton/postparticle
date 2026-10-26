import { manageHandler, manageProject } from "@/lib/manage-api";
import { json } from "@/lib/http";
import { readWorkspaceDashboard } from "@/lib/workspace-dashboard";

type Context = { params: Promise<{ projectId: string }> };

export const GET = manageHandler(async (request: Request, context: Context) => {
  const { projectId } = await context.params;
  const { store } = await manageProject(request, projectId);
  return json(await readWorkspaceDashboard(store));
});
