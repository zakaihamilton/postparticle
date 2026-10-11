import { HttpError } from "@/lib/config";
import { errorResponse, json } from "@/lib/http";
import { publicProjectStore } from "@/lib/projects";
import { readPublicArticle } from "@/lib/public";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; slug: string }> },
) {
  try {
    const { projectId, slug } = await params;
    const requestedOrganizationId = new URL(request.url).searchParams.get(
      "organizationId",
    );
    if (!requestedOrganizationId)
      throw new HttpError(400, "organizationId is required");
    const { store } = await publicProjectStore(
      requestedOrganizationId,
      projectId,
    );
    return json(await readPublicArticle(projectId, slug, store));
  } catch (error) {
    return errorResponse(error);
  }
}
