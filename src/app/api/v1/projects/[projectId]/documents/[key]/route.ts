import { json } from "@/lib/http";
import { publicProjectGet, readPublicDocument } from "@/lib/public";

export const dynamic = "force-dynamic";

export function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; key: string }> },
) {
  return publicProjectGet(
    request,
    params,
    async ({ params: resolved, store }) =>
      json(await readPublicDocument(resolved.projectId, resolved.key, store)),
  );
}
