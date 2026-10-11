import { z } from "zod";
import { manageHandler, manageProject } from "@/lib/manage-api";
import { getRecord } from "@/lib/content";
import { HttpError, identifier } from "@/lib/config";
import { json } from "@/lib/http";
import { listMedia } from "@/lib/media";

type Context = { params: Promise<{ projectId: string }> };

export const GET = manageHandler(async (request: Request, context: Context) => {
  const { store } = await manageProject(
    request,
    (await context.params).projectId,
  );
  const query = new URL(request.url).searchParams;
  const kind = z.enum(["articles", "documents"]).parse(query.get("kind"));
  const rawId = query.get("id");
  if (!rawId) throw new HttpError(400, "Choose content to load");
  const id = rawId === "new" ? null : identifier.parse(rawId);

  const recordPromise = id
    ? getRecord(kind, id, store).then((record) => {
        if (!record) throw new HttpError(404, "Content not found");
        return record;
      })
    : Promise.resolve(null);
  const mediaPromise =
    query.get("includeMedia") === "true"
      ? listMedia(store)
          .then((media) => ({ media }))
          .catch(() => ({
            media: [],
            mediaError: "The media library could not be loaded.",
          }))
      : Promise.resolve({});

  const [record, mediaResult] = await Promise.all([
    recordPromise,
    mediaPromise,
  ]);
  return json({ record, ...mediaResult });
});
