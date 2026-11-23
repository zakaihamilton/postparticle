import "server-only";
import { HttpError, identifier } from "./config";
import {
  deletingProjectIds,
  getProjectDeletionMarker,
  type ProjectDeletionMarker,
  preserveDeletionMarkers,
} from "./project-deletions";
import {
  appendProjectRegistryChanges,
  type ProjectRecord,
  parsedOrganizationId,
  projectRegistryProjection,
  validateProjects,
  withRegistryMutationLock,
} from "./project-registry-log";
import { contentStore, projectStore, type Store } from "./storage";

export {
  beginProjectDeletion,
  getProjectDeletionMarker,
} from "./project-deletions";
export type { ProjectRecord } from "./project-registry-log";

export async function getProjectRegistry(
  rawOrganizationId: string,
  options: { includeArchived?: boolean; includeDeleting?: boolean } = {},
): Promise<ProjectRecord[]> {
  const organizationId = parsedOrganizationId(rawOrganizationId);
  const projection = await projectRegistryProjection(organizationId);
  const projects = await preserveDeletionMarkers(
    organizationId,
    projection.projects,
  );
  return projects
    .filter(
      (project) =>
        (options.includeArchived || !project.archived) &&
        (options.includeDeleting || !project.deleting),
    )
    .map((project) =>
      projection.conflictedProjectIds.has(project.id)
        ? { ...project, registryConflict: true }
        : project,
    );
}

export async function getProject(
  organizationId: string,
  rawProjectId: string,
  options: { includeArchived?: boolean; includeDeleting?: boolean } = {},
) {
  const normalizedOrganizationId = parsedOrganizationId(organizationId);
  const projectId = identifier.parse(rawProjectId);
  const project = (
    await projectRegistryProjection(normalizedOrganizationId)
  ).projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new HttpError(404, "Project not found");
  const deleting =
    project.deleting ||
    (await getProjectDeletionMarker(normalizedOrganizationId, projectId)) !==
      null;
  if (project.archived && !options.includeArchived)
    throw new HttpError(404, "Project not found");
  if (deleting && !options.includeDeleting)
    throw new HttpError(404, "Project not found");
  return deleting ? { ...project, deleting: true } : project;
}

export function productionVisible(project: ProjectRecord) {
  return process.env.VERCEL_ENV !== "production" || project.production;
}

export function projectStoreFor(
  organizationId: string,
  project: ProjectRecord,
): Store {
  const normalizedOrganizationId = parsedOrganizationId(organizationId);
  const legacy =
    project.legacyOrganizationId?.toLowerCase() === normalizedOrganizationId;
  let deletionMarkerCheck: Promise<ProjectDeletionMarker | null> | undefined;
  return projectStore(
    normalizedOrganizationId,
    project.id,
    legacy,
    async (operation) => {
      // A request can reuse read checks; every write still rechecks deletion.
      const marker =
        operation === "get" || operation === "list"
          ? await (deletionMarkerCheck ??= getProjectDeletionMarker(
              normalizedOrganizationId,
              project.id,
            ))
          : await getProjectDeletionMarker(
              normalizedOrganizationId,
              project.id,
            );
      if (marker) throw new HttpError(404, "Project not found");
    },
  );
}

export async function publicProjectStore(
  organizationId: string,
  projectId: string,
) {
  const project = await getProject(organizationId, projectId, {
    includeArchived: true,
  });
  if (!productionVisible(project))
    throw new HttpError(404, "Project not found");
  return { project, store: projectStoreFor(organizationId, project) };
}

export async function findLegacyProject(projectId: string) {
  const validId = identifier.parse(projectId);
  const keys = await contentStore().list("organizations/");
  const organizationIds = new Set(
    keys.flatMap((key) => {
      const match = /^organizations\/([0-9a-f-]{36})\//i.exec(key);
      return match ? [match[1].toLowerCase()] : [];
    }),
  );
  for (const organizationId of organizationIds) {
    const project = (
      await getProjectRegistry(organizationId, {
        includeArchived: true,
        includeDeleting: true,
      })
    ).find(
      (candidate) =>
        candidate.id === validId &&
        candidate.legacyOrganizationId === organizationId,
    );
    if (project) return { organizationId, project };
  }
  return null;
}

export async function updateProjectRegistry(
  organizationId: string,
  update: (projects: ProjectRecord[]) => ProjectRecord[],
  options: { resolveProjectIds?: string[] } = {},
) {
  const normalizedOrganizationId = parsedOrganizationId(organizationId);
  return withRegistryMutationLock(normalizedOrganizationId, async () => {
    const projection = await projectRegistryProjection(
      normalizedOrganizationId,
    );
    const current = projection.projects;
    const deletingIds = await deletingProjectIds(normalizedOrganizationId);
    const protectedCurrent = await preserveDeletionMarkers(
      normalizedOrganizationId,
      current,
      deletingIds,
    );
    const next = validateProjects(
      update(protectedCurrent),
      normalizedOrganizationId,
    );
    const currentIds = new Set(current.map((project) => project.id));
    if (
      next.some(
        (project) => !currentIds.has(project.id) && deletingIds.has(project.id),
      )
    )
      throw new HttpError(
        409,
        "A permanently deleted project ID cannot be reused.",
      );
    const persistedNext = next.map((project) => {
      if (!deletingIds.has(project.id)) return project;
      const stored = current.find((candidate) => candidate.id === project.id);
      return { ...project, deleting: stored?.deleting ?? false };
    });
    return appendProjectRegistryChanges(
      normalizedOrganizationId,
      current,
      persistedNext,
      new Set(
        (options.resolveProjectIds ?? [])
          .map((id) => identifier.parse(id))
          .filter((id) => projection.conflictedProjectIds.has(id)),
      ),
    );
  });
}
