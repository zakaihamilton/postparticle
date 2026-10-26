import { manageHandler, manageProject } from "@/lib/manage-api";
import { HttpError } from "@/lib/config";
import { json, readJson } from "@/lib/http";
import { listMediaPage, startUpload } from "@/lib/media";

type Context = { params: Promise<{ projectId: string }> };

export const GET = manageHandler(async (request: Request, context: Context) => {
  const { store } = await manageProject(
    request,
    (await context.params).projectId,
  );
  const url = new URL(request.url);
  const rawOffset = Number(url.searchParams.get("offset") ?? 0);
  const rawLimit = Number(url.searchParams.get("limit") ?? 24);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (
    !Number.isSafeInteger(rawOffset) ||
    rawOffset < 0 ||
    !Number.isSafeInteger(rawLimit) ||
    rawLimit < 1 ||
    rawLimit > 60 ||
    query.length > 200
  )
    throw new HttpError(400, "Invalid media page request");
  return json(
    await listMediaPage(store, {
      offset: rawOffset,
      limit: rawLimit,
      query,
    }),
  );
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
