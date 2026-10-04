import { manageHandler, manageProject } from "@/lib/manage-api";
import { json, readJson } from "@/lib/http";
import { listMedia, startUpload } from "@/lib/media";

type Context = { params: Promise<{ projectId: string }> };

export const GET = manageHandler(async (request: Request, context: Context) => {
  const { store } = await manageProject(
    request,
    (await context.params).projectId,
  );
  return json(await listMedia(store));
});

export const POST = manageHandler(
  async (request: Request, context: Context) => {
    const { actor, projectId, store } = await manageProject(
      request,
      (await context.params).projectId,
    );
    return json(
      await startUpload(
        actor.username,
        await readJson(request),
        store,
        projectId,
      ),
    );
  },
);
