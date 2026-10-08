import { organizationIdentifier } from "@/lib/config";
import { errorResponse, json } from "@/lib/http";
import { projectStore } from "@/lib/storage";
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
    const store = requestedOrganizationId
      ? projectStore(organizationIdentifier.parse(requestedOrganizationId), projectId)
      : projectStore(projectId);
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
