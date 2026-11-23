import "server-only";
import { z } from "zod";
import { HttpError, identifier, organizationIdentifier } from "./config";
import {
  type ProjectRecord,
  parsedOrganizationId,
} from "./project-registry-log";
import { contentStore } from "./storage";

const deletionKey = (organizationId: string, projectId: string) =>
  `organizations/${organizationId}/project-deletions/${projectId}.json`;
const deletionPrefix = (organizationId: string) =>
  `organizations/${organizationId}/project-deletions/`;
const deletionMarkerCache = new Map<string, ProjectDeletionMarker>();
const uploadUrlDrainMs = 6 * 60 * 1000;

export interface ProjectDeletionMarker {
  organizationId: string;
  projectId: string;
  startedAt: number;
  cleanupNotBefore: number;
}

const deletionMarkerSchema = z.object({
  organizationId: organizationIdentifier,
  projectId: identifier,
  startedAt: z.number().int().nonnegative(),
  cleanupNotBefore: z.number().int().nonnegative(),
});

export async function deletingProjectIds(organizationId: string) {
  const keys = await contentStore().list(deletionPrefix(organizationId));
  const prefix = deletionPrefix(organizationId);
  return new Set(
    keys.flatMap((key) => {
      const match = /^([a-z0-9][a-z0-9_-]{0,79})\.json$/.exec(
        key.slice(prefix.length),
      );
      return match ? [match[1]] : [];
    }),
  );
}

export async function getProjectDeletionMarker(
  rawOrganizationId: string,
  rawProjectId: string,
): Promise<ProjectDeletionMarker | null> {
  const organizationId = parsedOrganizationId(rawOrganizationId);
  const projectId = identifier.parse(rawProjectId);
  const key = deletionKey(organizationId, projectId);
  const cached = deletionMarkerCache.get(key);
  if (cached) return cached;

  const raw = await contentStore().get<unknown>(key);
  if (raw === null) return null;
  const parsed = deletionMarkerSchema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.organizationId.toLowerCase() !== organizationId ||
    parsed.data.projectId !== projectId
  )
    throw new HttpError(503, "The project deletion marker is invalid.");
  deletionMarkerCache.set(key, parsed.data);
  return parsed.data;
}

export async function beginProjectDeletion(
  rawOrganizationId: string,
  rawProjectId: string,
): Promise<ProjectDeletionMarker> {
  const organizationId = parsedOrganizationId(rawOrganizationId);
  const projectId = identifier.parse(rawProjectId);
  const existing = await getProjectDeletionMarker(organizationId, projectId);
  if (existing) return existing;

  const startedAt = Date.now();
  const marker = {
    organizationId,
    projectId,
    startedAt,
    cleanupNotBefore: startedAt + uploadUrlDrainMs,
  };
  await contentStore().put(deletionKey(organizationId, projectId), marker);
  deletionMarkerCache.set(deletionKey(organizationId, projectId), marker);
  return marker;
}

export async function preserveDeletionMarkers(
  organizationId: string,
  projects: ProjectRecord[],
  knownDeletingIds?: Set<string>,
) {
  const deletingIds =
    knownDeletingIds ?? (await deletingProjectIds(organizationId));
  return projects.map((project) =>
    deletingIds.has(project.id) ? { ...project, deleting: true } : project,
  );
}
