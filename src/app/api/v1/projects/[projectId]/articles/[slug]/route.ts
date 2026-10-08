import { organizationIdentifier } from "@/lib/config";
import { errorResponse, json } from "@/lib/http";
import { projectStore } from "@/lib/storage";
import { readPublicArticle } from "@/lib/public";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; slug: string }> },
) {
  try {
    const { projectId, slug } = await params;
    const requestedOrganizationId = new URL(request.url).searchParams.get("organizationId");
    const store = requestedOrganizationId
      ? projectStore(organizationIdentifier.parse(requestedOrganizationId), projectId)
      : projectStore(projectId);
    return json(await readPublicArticle(projectId, slug, store));
  } catch (error) {
    return errorResponse(error);
  }
}
