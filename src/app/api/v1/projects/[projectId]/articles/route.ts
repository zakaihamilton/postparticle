import { json } from "@/lib/http";
import { listPublicArticles, publicProjectGet } from "@/lib/public";

export const dynamic = "force-dynamic";

export function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return publicProjectGet(
    request,
    params,
    async ({ params: resolved, url, store }) =>
      json(
        await listPublicArticles(
          resolved.projectId,
          Object.fromEntries(url.searchParams),
          store,
        ),
      ),
  );
}
