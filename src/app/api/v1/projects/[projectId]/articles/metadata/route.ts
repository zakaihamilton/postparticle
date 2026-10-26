import { performance } from "node:perf_hooks";
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
    const startedAt = performance.now();
    const page = await listPublicArticleMetadata(query, store);
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs >= 1_000)
      console.warn("Slow public article metadata response", {
        durationMs,
        page: page.page,
        pageSize: page.pageSize,
      });
    return json(page, 200, {
      "Cache-Control":
        "public, max-age=0, s-maxage=45, stale-while-revalidate=15",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
