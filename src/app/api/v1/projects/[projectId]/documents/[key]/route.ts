import { HttpError } from "@/lib/config";
import { errorResponse, json } from "@/lib/http";
import { publicProjectStore } from "@/lib/projects";
import { readPublicDocument } from "@/lib/public";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; key: string }> },
) {
  try {
    const { projectId, key } = await params;
    const requestedOrganizationId = new URL(request.url).searchParams.get(
      "organizationId",
    );
    if (!requestedOrganizationId)
      throw new HttpError(400, "organizationId is required");
    const { store } = await publicProjectStore(
      requestedOrganizationId,
      projectId,
    );
    return json(await readPublicDocument(projectId, key, store));
  } catch (error) {
    return errorResponse(error);
  }
}
