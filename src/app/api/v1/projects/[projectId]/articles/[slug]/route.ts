import { errorResponse, json } from "@/lib/http";
import { readPublicArticle } from "@/lib/public";
export const dynamic = "force-dynamic";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ projectId: string; slug: string }> },
) {
  try {
    const { projectId, slug } = await params;
    return json(await readPublicArticle(projectId, slug));
  } catch (error) {
    return errorResponse(error);
  }
}
