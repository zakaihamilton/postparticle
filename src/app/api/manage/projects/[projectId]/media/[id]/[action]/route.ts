import { z } from "zod";
import { HttpError, localDriver } from "@/lib/config";
import { json, readBytes, readJson } from "@/lib/http";
import { manageHandler, manageProject } from "@/lib/manage-api";
import {
  abortUpload,
  finishUpload,
  previewMedia,
  signPart,
  writeLocalUpload,
} from "@/lib/media";

type Context = {
  params: Promise<{ projectId: string; id: string; action: string }>;
};

export const GET = manageHandler(async (request: Request, context: Context) => {
  const { projectId, id, action } = await context.params;
  const { store } = await manageProject(request, projectId);
  if (action === "preview-file")
    return new Response(null, {
      status: 302,
      headers: {
        Location: await previewMedia(id, store),
        "Cache-Control": "no-store",
      },
    });
  if (action === "preview") return json({ url: await previewMedia(id, store) });
  throw new HttpError(404, "Route not found");
});

export const POST = manageHandler(
  async (request: Request, context: Context) => {
    const { projectId, id, action } = await context.params;
    const { actor, store } = await manageProject(request, projectId);
    if (action === "part") {
      const data = z
        .object({ part: z.number().int() })
        .parse(await readJson(request));
      return json({ url: await signPart(id, data.part, store) });
    }
    if (action === "complete") {
      const data = z
        .object({ parts: z.unknown().optional() })
        .parse(await readJson(request));
      await finishUpload(actor.username, id, data.parts, store);
      return json({ ok: true });
    }
    if (action === "abort") {
      await abortUpload(id, store);
      return json({ ok: true });
    }
    throw new HttpError(404, "Route not found");
  },
);

export const PUT = manageHandler(async (request: Request, context: Context) => {
  const { projectId, id, action } = await context.params;
  const { store } = await manageProject(request, projectId);
  if (action !== "bytes") throw new HttpError(404, "Route not found");
  if (!localDriver()) throw new HttpError(404, "Not found");
  if (Number(request.headers.get("content-length")) > 32 * 1024 * 1024)
    throw new HttpError(413, "Local test uploads are limited to 32 MiB");
  await writeLocalUpload(id, await readBytes(request, 32 * 1024 * 1024), store);
  return json({ ok: true });
});
