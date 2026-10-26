import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { authorizeProject, currentAuthContext } from "@/lib/auth";
import { HttpError } from "@/lib/config";
import { getMedia, mediaOriginalUrl } from "@/lib/media";
import { projectStoreFor } from "@/lib/projects";
import type { Media } from "@/lib/types";
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
  const mediaDetail = view[0] === "media" && view.length === 2;
  if (
    view.length > 2 ||
    (view[0] &&
      !["articles", "documents", "media", "members", "settings"].includes(
        view[0],
      )) ||
    (view.length > 1 &&
      !["articles", "documents"].includes(view[0]) &&
      !(mediaDetail && z.string().uuid().safeParse(view[1]).success))
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
  let initialMedia: Media | null = null;
  let initialMediaUrl: string | null = null;
  if (mediaDetail) {
    const store = projectStoreFor(actor.organizationId, project);
    initialMedia = await getMedia(view[1], store);
    if (!initialMedia || initialMedia.deleted || !initialMedia.ready)
      notFound();
    initialMediaUrl = await mediaOriginalUrl(initialMedia.id, store);
  }
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
      initialMedia={initialMedia}
      initialMediaUrl={initialMediaUrl}
      initialDashboard={initialDashboard}
    />
  );
}
