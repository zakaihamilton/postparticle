import { errorResponse, json } from "@/lib/http";
import { listPublicArticles } from "@/lib/public";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    return json(
      await listPublicArticles(
        (await params).projectId,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
