import { HttpError } from "@/lib/config";
import { errorResponse, json } from "@/lib/http";
import { publicProjectStore } from "@/lib/projects";
import { listPublicArticles } from "@/lib/public";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const projectId = (await params).projectId;
    const url = new URL(request.url);
    const requestedOrganizationId = url.searchParams.get("organizationId");
    if (!requestedOrganizationId)
      throw new HttpError(400, "organizationId is required");
    const { store } = await publicProjectStore(
      requestedOrganizationId,
      projectId,
    );
    return json(
      await listPublicArticles(
        projectId,
        Object.fromEntries(url.searchParams),
        store,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
