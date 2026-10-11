import "server-only";
import { z } from "zod";
import { HttpError, identifier, organizationIdentifier } from "./config";
import { contentStore, projectStore, type Store } from "./storage";
import type { Project } from "./types";

const registryKey = (organizationId: string) =>
  `organizations/${organizationId}/projects.json`;
const deletionKey = (organizationId: string, projectId: string) =>
  `organizations/${organizationId}/project-deletions/${projectId}.json`;
const deletionPrefix = (organizationId: string) =>
  `organizations/${organizationId}/project-deletions/`;
const cacheTtlMs = 60_000;
const cache = new Map<
  string,
  { expiresAt: number; projects: ProjectRecord[] }
>();
const mutationTails = new Map<string, Promise<void>>();
const deletionMarkerCache = new Map<string, ProjectDeletionMarker>();
const uploadUrlDrainMs = 6 * 60 * 1000;

const projectRecordSchema = z.object({
  id: identifier,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000),
  production: z.boolean().default(true),
  legacyOrganizationId: organizationIdentifier.optional(),
  archived: z.boolean().default(false),
  deleting: z.boolean().default(false),
});
const projectListSchema = z.array(projectRecordSchema);

export interface ProjectRecord extends Project {
  production: boolean;
  legacyOrganizationId?: string;
  archived: boolean;
  deleting: boolean;
}

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

function parsedOrganizationId(value: string) {
  return organizationIdentifier.parse(value).toLowerCase();
}

function validateProjects(value: unknown, organizationId: string) {
  const parsed = projectListSchema.safeParse(value);
  if (!parsed.success)
    throw new HttpError(503, "The project registry is invalid.");
  const projects = parsed.data.map((project) => ({
    ...project,
    legacyOrganizationId: project.legacyOrganizationId?.toLowerCase(),
  }));
  if (new Set(projects.map((project) => project.id)).size !== projects.length)
    throw new HttpError(503, "The project registry contains duplicate IDs.");
  if (
    projects.some(
      (project) =>
        project.legacyOrganizationId &&
        project.legacyOrganizationId !== organizationId,
    )
  )
    throw new HttpError(
      503,
      "The project registry has an invalid storage mapping.",
    );
  return projects;
}

async function withRegistryMutationLock<T>(
  organizationId: string,
  action: () => Promise<T>,
): Promise<T> {
  const previous = mutationTails.get(organizationId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => current);
  mutationTails.set(organizationId, tail);
  await previous.catch(() => undefined);
  try {
    return await action();
  } finally {
    release();
    if (mutationTails.get(organizationId) === tail)
      mutationTails.delete(organizationId);
  }
}

async function cachedRegistry(organizationId: string) {
  let entry = cache.get(organizationId);
  if (!entry || entry.expiresAt <= Date.now()) {
    const raw = await contentStore().get<unknown>(registryKey(organizationId));
    entry = {
      projects: validateProjects(raw ?? [], organizationId),
      expiresAt: Date.now() + cacheTtlMs,
    };
    cache.set(organizationId, entry);
  }
  return entry.projects;
}

async function deletingProjectIds(organizationId: string) {
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

async function preserveDeletionMarkers(
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

async function persistProjectRegistry(
  organizationId: string,
  projects: ProjectRecord[],
) {
  const validated = validateProjects(projects, organizationId);
  await contentStore().put(registryKey(organizationId), validated);
  cache.set(organizationId, {
    projects: validated,
    expiresAt: Date.now() + cacheTtlMs,
  });
  return validated;
}

export async function getProjectRegistry(
  rawOrganizationId: string,
  options: { includeArchived?: boolean; includeDeleting?: boolean } = {},
): Promise<ProjectRecord[]> {
  const organizationId = parsedOrganizationId(rawOrganizationId);
  const projects = await preserveDeletionMarkers(
    organizationId,
    await cachedRegistry(organizationId),
  );
  return projects.filter(
    (project) =>
      (options.includeArchived || !project.archived) &&
      (options.includeDeleting || !project.deleting),
  );
}

export async function getProject(
  organizationId: string,
  rawProjectId: string,
  options: { includeArchived?: boolean; includeDeleting?: boolean } = {},
) {
  const normalizedOrganizationId = parsedOrganizationId(organizationId);
  const projectId = identifier.parse(rawProjectId);
  const project = (await cachedRegistry(normalizedOrganizationId)).find(
    (candidate) => candidate.id === projectId,
  );
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
  return projectStore(
    normalizedOrganizationId,
    project.id,
    legacy,
    async () => {
      if (await getProjectDeletionMarker(normalizedOrganizationId, project.id))
        throw new HttpError(404, "Project not found");
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
      const match = /^organizations\/([0-9a-f-]{36})\/projects\.json$/i.exec(
        key,
      );
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

export async function writeProjectRegistry(
  rawOrganizationId: string,
  projects: unknown,
  options: { onlyIfMissing?: boolean } = {},
) {
  const organizationId = parsedOrganizationId(rawOrganizationId);
  return withRegistryMutationLock(organizationId, async () => {
    const store = contentStore();
    const key = registryKey(organizationId);
    if (options.onlyIfMissing && (await store.get<unknown>(key)) !== null)
      throw new HttpError(
        409,
        `A project registry already exists for ${organizationId}.`,
      );
    const validated = validateProjects(projects, organizationId);
    const deletingIds = await deletingProjectIds(organizationId);
    const protectedProjects = await preserveDeletionMarkers(
      organizationId,
      validated,
      deletingIds,
    );
    const currentIds = new Set(
      validateProjects(
        (await store.get<unknown>(key)) ?? [],
        organizationId,
      ).map((project) => project.id),
    );
    if (
      protectedProjects.some(
        (project) => !currentIds.has(project.id) && deletingIds.has(project.id),
      )
    )
      throw new HttpError(
        409,
        "A permanently deleted project ID cannot be reused.",
      );
    return persistProjectRegistry(organizationId, protectedProjects);
  });
}

export async function updateProjectRegistry(
  organizationId: string,
  update: (projects: ProjectRecord[]) => ProjectRecord[],
) {
  const normalizedOrganizationId = parsedOrganizationId(organizationId);
  return withRegistryMutationLock(normalizedOrganizationId, async () => {
    const store = contentStore();
    const current = validateProjects(
      (await store.get<unknown>(registryKey(normalizedOrganizationId))) ?? [],
      normalizedOrganizationId,
    );
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
    return persistProjectRegistry(
      normalizedOrganizationId,
      await preserveDeletionMarkers(
        normalizedOrganizationId,
        next,
        deletingIds,
      ),
    );
  });
}
