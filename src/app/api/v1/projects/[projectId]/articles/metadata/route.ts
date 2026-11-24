import { performance } from "node:perf_hooks";
import { json } from "@/lib/http";
import { listPublicArticleMetadata, publicProjectGet } from "@/lib/public";

export const dynamic = "force-dynamic";

export function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return publicProjectGet(request, params, async ({ url, store }) => {
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
  });
}
