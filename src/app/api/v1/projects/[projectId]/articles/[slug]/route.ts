import { json } from "@/lib/http";
import { publicProjectGet, readPublicArticle } from "@/lib/public";

export const dynamic = "force-dynamic";

export function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; slug: string }> },
) {
  return publicProjectGet(
    request,
    params,
    async ({ params: resolved, store }) =>
      json(await readPublicArticle(resolved.projectId, resolved.slug, store)),
  );
}
