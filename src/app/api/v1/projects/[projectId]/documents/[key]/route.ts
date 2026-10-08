import { organizationIdentifier } from "@/lib/config";
import { errorResponse, json } from "@/lib/http";
import { projectStore } from "@/lib/storage";
import { readPublicDocument } from "@/lib/public";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; key: string }> },
) {
  try {
    const { projectId, key } = await params;
    const requestedOrganizationId = new URL(request.url).searchParams.get("organizationId");
    const store = requestedOrganizationId
      ? projectStore(organizationIdentifier.parse(requestedOrganizationId), projectId)
      : projectStore(projectId);
    return json(await readPublicDocument(projectId, key, store));
  } catch (error) {
    return errorResponse(error);
  }
}
