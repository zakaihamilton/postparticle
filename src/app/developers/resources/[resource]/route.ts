import { integrationGuide } from "@/components/developers/snippets";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  if ((await params).resource !== "integration")
    return new Response("Not found", { status: 404 });
  return new Response(integrationGuide, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'inline; filename="integration.md"',
    },
  });
}
