import { notFound, redirect } from "next/navigation";
import { authorizeProject, currentAuthContext } from "@/lib/auth";
import { HttpError } from "@/lib/config";
import { projectStoreFor } from "@/lib/projects";
import { readWorkspaceDashboardResult } from "@/lib/workspace-dashboard";
import Workspace from "@/components/workspace";
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string; view?: string[] }>;
}) {
  const [context, routeParams] = await Promise.all([
    currentAuthContext(),
    params,
  ]);
  if (!context) redirect("/login");
  const { actor } = context;
  const { projectId, view = [] } = routeParams;
  if (
    view.length > 2 ||
    (view[0] &&
      !["articles", "documents", "media", "members", "settings"].includes(
        view[0],
      )) ||
    (view.length > 1 && !["articles", "documents"].includes(view[0]))
  )
    notFound();
  let workspaceAccess: Awaited<ReturnType<typeof authorizeProject>>;
  try {
    workspaceAccess = await authorizeProject(
      context,
      projectId,
      false,
      view[0] === "members",
    );
  } catch (error) {
    if (error instanceof HttpError && [403, 404].includes(error.status))
      redirect("/projects");
    throw error;
  }
  const { role, project } = workspaceAccess;
  const initialDashboard =
    view.length === 0
      ? readWorkspaceDashboardResult(
          projectStoreFor(actor.organizationId, project),
        )
      : Promise.resolve({ data: null, error: "" });
  return (
    <Workspace
      actor={actor}
      role={role}
      project={{
        id: project.id,
        name: project.name,
        description: project.description,
      }}
      view={view}
      initialDashboard={initialDashboard}
    />
  );
}
