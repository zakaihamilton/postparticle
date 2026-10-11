import { json } from "@/lib/http";
import { manageHandler, manageProject } from "@/lib/manage-api";

type Context = { params: Promise<{ projectId: string }> };

export const GET = manageHandler(async (request: Request, context: Context) => {
  const { project, role } = await manageProject(
    request,
    (await context.params).projectId,
  );
  return json({
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
    },
    role,
  });
});
