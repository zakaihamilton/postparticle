import { HttpError } from "@/lib/config";
import { errorResponse, json } from "@/lib/http";
import { listPublicArticleMetadata } from "@/lib/public";
import { publicProjectStore } from "@/lib/projects";

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
    const query = Object.fromEntries(url.searchParams);
    delete query.organizationId;
    return json(await listPublicArticleMetadata(query, store));
  } catch (error) {
    return errorResponse(error);
  }
}
