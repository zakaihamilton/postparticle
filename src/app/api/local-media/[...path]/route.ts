import { authorizeResolvedProject, requireAuthContext } from "@/lib/auth";
import { HttpError, localDriver, organizationIdentifier } from "@/lib/config";
import { errorResponse } from "@/lib/http";
import {
  findLegacyProject,
  getProject,
  productionVisible,
  projectStoreFor,
  type ProjectRecord,
} from "@/lib/projects";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    if (!localDriver()) throw new HttpError(404, "Not found");
    const path = (await params).path;
    let organizationId: string;
    let projectId: string;
    let keySegments: string[];
    let project: ProjectRecord;
    if (organizationIdentifier.safeParse(path[0]).success) {
      [organizationId, projectId, ...keySegments] = path;
      organizationId = organizationIdentifier
        .parse(organizationId)
        .toLowerCase();
      project = await getProject(
        organizationId,
        projectId,
        keySegments[0] === "public" ? { includeArchived: true } : {},
      );
    } else {
      [projectId, ...keySegments] = path;
      const legacy = await findLegacyProject(projectId);
      if (!legacy) throw new HttpError(404, "Not found");
      organizationId = legacy.organizationId;
      project = legacy.project;
      if (project.deleting) throw new HttpError(404, "Not found");
    }
    if (keySegments[0] === "public" && !productionVisible(project))
      throw new HttpError(404, "Not found");
    if (!organizationId || !projectId) throw new HttpError(404, "Not found");
    const key = keySegments.join("/");
    if (!/^((public\/media)|(originals))\/[0-9a-f-]{36}\/asset$/.test(key))
      throw new HttpError(404, "Not found");
    if (!key.startsWith("public/")) {
      const authContext = await requireAuthContext();
      await authorizeResolvedProject(authContext, organizationId, project);
    }
    const store = projectStoreFor(organizationId, project);
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
