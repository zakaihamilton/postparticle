import { errorResponse, json } from "@/lib/http";
import { readPublicDocument } from "@/lib/public";
export const dynamic = "force-dynamic";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ projectId: string; key: string }> },
) {
  try {
    const { projectId, key } = await params;
    return json(await readPublicDocument(projectId, key));
  } catch (error) {
    return errorResponse(error);
  }
}
