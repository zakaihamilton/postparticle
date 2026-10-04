import { HttpError } from "@/lib/config";
import { json, readJson } from "@/lib/http";
import { manageHandler, manageProject } from "@/lib/manage-api";
import { deleteMedia, editMedia, getMedia } from "@/lib/media";

type Context = { params: Promise<{ projectId: string; id: string }> };

export const GET = manageHandler(async (request: Request, context: Context) => {
  const { projectId, id } = await context.params;
  const { store } = await manageProject(request, projectId);
  const media = await getMedia(id, store);
  if (!media || media.deleted) throw new HttpError(404, "Media not found");
  return json(media);
});

export const PATCH = manageHandler(
  async (request: Request, context: Context) => {
    const { projectId, id } = await context.params;
    const { actor, store } = await manageProject(request, projectId);
    await editMedia(actor.username, id, await readJson(request), store);
    return json({ ok: true });
  },
);

export const DELETE = manageHandler(
  async (request: Request, context: Context) => {
    const { projectId, id } = await context.params;
    const { actor, store } = await manageProject(request, projectId);
    await deleteMedia(actor.username, id, store);
    return json({ ok: true });
  },
);
