import { notFound, redirect } from "next/navigation";
import { authorize, currentActor } from "@/lib/auth";
import { HttpError } from "@/lib/config";
import { getProject } from "@/lib/projects";
import Workspace from "@/components/workspace";
import type { Role } from "@/lib/types";
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string; view?: string[] }>;
}) {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  const { projectId, view = [] } = await params;
  if (
    view.length > 2 ||
    (view[0] &&
      !["articles", "documents", "media", "members", "settings"].includes(
        view[0],
      )) ||
    (view.length > 1 && !["articles", "documents"].includes(view[0]))
  )
    notFound();
  let role: Role;
  try {
    role = await authorize(actor, projectId, false, view[0] === "members");
  } catch (error) {
    if (error instanceof HttpError && [403, 404].includes(error.status))
      redirect("/projects");
    throw error;
  }
  const project = await getProject(actor.organizationId, projectId);
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
    />
  );
}
