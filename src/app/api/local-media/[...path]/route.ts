import { requireActor, authorize } from "@/lib/auth";
import {
  HttpError,
  legacyOrganizationIdForProject,
  localDriver,
  organizationIdentifier,
} from "@/lib/config";
import { errorResponse } from "@/lib/http";
import { projectStore } from "@/lib/storage";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    if (!localDriver()) throw new HttpError(404, "Not found");
    const path = (await params).path;
    let organizationId: string | null;
    let projectId: string;
    let keySegments: string[];
    if (organizationIdentifier.safeParse(path[0]).success) {
      [organizationId, projectId, ...keySegments] = path;
      organizationId = organizationIdentifier.parse(organizationId).toLowerCase();
    } else {
      [projectId, ...keySegments] = path;
      organizationId = legacyOrganizationIdForProject(projectId);
    }
    if (!organizationId || !projectId) throw new HttpError(404, "Not found");
    const key = keySegments.join("/");
    if (!/^((public\/media)|(originals))\/[0-9a-f-]{36}\/asset$/.test(key))
      throw new HttpError(404, "Not found");
    if (!key.startsWith("public/")) {
      const actor = await requireActor();
      if (actor.organizationId !== organizationId)
        throw new HttpError(403, "You do not have permission for this action");
      await authorize(actor, projectId);
    }
    const store = projectStore(organizationId, projectId);
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
