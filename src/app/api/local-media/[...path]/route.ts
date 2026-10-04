import { requireActor, authorize } from "@/lib/auth";
import { HttpError, localDriver } from "@/lib/config";
import { errorResponse } from "@/lib/http";
import { projectStore } from "@/lib/storage";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    if (!localDriver()) throw new HttpError(404, "Not found");
    const [projectId, ...segments] = (await params).path;
    const key = segments.join("/");
    if (!/^((public\/media)|(originals))\/[0-9a-f-]{36}\/asset$/.test(key))
      throw new HttpError(404, "Not found");
    if (!key.startsWith("public/"))
      await authorize(await requireActor(), projectId);
    const store = projectStore(projectId);
    const head = await store.head(key);
    return new Response(new Uint8Array(await store.bytes(key)), {
      headers: {
        "Content-Type": head.contentType,
        "Cache-Control": key.startsWith("public/")
          ? "public, max-age=60"
          : "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
