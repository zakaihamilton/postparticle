import { json } from "@/lib/http";
import { legacyProjectsForOrganization } from "@/lib/legacy-projects";
import { manageHandler, managePlatformAdmin } from "@/lib/manage-api";
import {
  getProjectDeletionMarker,
  getProjectRegistry,
  updateProjectRegistry,
} from "@/lib/projects";

async function restorableProjects(organizationId: string) {
  const [legacyProjects, registeredProjects] = await Promise.all([
    legacyProjectsForOrganization(organizationId),
    getProjectRegistry(organizationId, {
      includeArchived: true,
      includeDeleting: true,
    }),
  ]);
  const registeredIds = new Set(
    registeredProjects.map((project) => project.id),
  );
  const missing = legacyProjects.filter(
    (project) => !registeredIds.has(project.id),
  );
  const deletionMarkers = await Promise.all(
    missing.map((project) =>
      getProjectDeletionMarker(organizationId, project.id),
    ),
  );
  return missing.filter((_, index) => deletionMarkers[index] === null);
}

export const GET = manageHandler(async (request: Request) => {
  const actor = await managePlatformAdmin(request);
  return json({ projects: await restorableProjects(actor.organizationId) });
});

export const POST = manageHandler(async (request: Request) => {
  const actor = await managePlatformAdmin(request);
  const candidates = await restorableProjects(actor.organizationId);
  let restoredIds: string[] = [];

  await updateProjectRegistry(actor.organizationId, (projects) => {
    const registeredIds = new Set(projects.map((project) => project.id));
    const additions = candidates.filter(
      (project) => !registeredIds.has(project.id),
    );
    restoredIds = additions.map((project) => project.id);
    return [...projects, ...additions];
  });

  return json({ restoredIds });
});
