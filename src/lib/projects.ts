import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { HttpError, identifier, organizationIdentifier } from "./config";
import { contentStore, projectStore, type Store } from "./storage";
import type { Project } from "./types";

const registryKey = (organizationId: string) =>
  `organizations/${organizationId}/projects.json`;
const registryChangePrefix = (organizationId: string) =>
  `organizations/${organizationId}/project-registry/changes/`;
const deletionKey = (organizationId: string, projectId: string) =>
  `organizations/${organizationId}/project-deletions/${projectId}.json`;
const deletionPrefix = (organizationId: string) =>
  `organizations/${organizationId}/project-deletions/`;
const mutationTails = new Map<string, Promise<void>>();
const deletionMarkerCache = new Map<string, ProjectDeletionMarker>();
const uploadUrlDrainMs = 6 * 60 * 1000;

const projectRecordSchema = z.object({
  id: identifier,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000),
  production: z.boolean().default(true),
  createdBySubjectId: z.string().min(1).optional(),
  legacyOrganizationId: organizationIdentifier.optional(),
  archived: z.boolean().default(false),
  deleting: z.boolean().default(false),
});
const projectListSchema = z.array(projectRecordSchema);

interface ProjectRegistryChange {
  version: 1 | 2;
  organizationId: string;
  projectId: string;
  previousHash: string | null;
  nextHash: string | null;
  next: ProjectRecord | null;
  resolvesConflict?: boolean;
}

export interface ProjectRecord extends Project {
  production: boolean;
  createdBySubjectId?: string;
  legacyOrganizationId?: string;
  archived: boolean;
  deleting: boolean;
  /** Transient warning included only in project registry responses. */
  registryConflict?: boolean;
}

interface ProjectRegistryProjection {
  projects: ProjectRecord[];
  conflictedProjectIds: Set<string>;
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

function projectHash(project: ProjectRecord | null) {
  if (!project) return null;
  const storedProject = { ...project };
  delete storedProject.registryConflict;
  return createHash("sha256")
    .update(JSON.stringify(storedProject))
    .digest("hex");
}

function projectChangeKey(
  organizationId: string,
  projectId: string,
  previousHash: string | null,
  nextHash: string | null,
  resolvesConflict = false,
) {
  const edge = createHash("sha256")
    .update(
      `${previousHash ?? "root"}\0${nextHash ?? "deleted"}${resolvesConflict ? "\0resolve" : ""}`,
    )
    .digest("hex");
  return `${registryChangePrefix(organizationId)}${projectId}/${edge}.json`;
}

function parseRegistryChange(
  value: unknown,
  key: string,
  organizationId: string,
): ProjectRegistryChange {
  if (!value || typeof value !== "object")
    throw new HttpError(503, "The project registry change log is invalid.");
  const change = value as Partial<ProjectRegistryChange>;
  const next =
    change.next === null
      ? null
      : (validateProjects([change.next], organizationId)[0] ?? null);
  const resolvesConflict = change.resolvesConflict === true;
  const validVersion =
    (change.version === 1 && change.resolvesConflict === undefined) ||
    (change.version === 2 &&
      resolvesConflict &&
      change.previousHash === change.nextHash);
  if (
    !validVersion ||
    typeof change.organizationId !== "string" ||
    change.organizationId.toLowerCase() !== organizationId ||
    typeof change.projectId !== "string" ||
    !/^[a-f0-9]{64}$/.test(key.slice(key.lastIndexOf("/") + 1, -5)) ||
    (change.previousHash !== null &&
      (typeof change.previousHash !== "string" ||
        !/^[a-f0-9]{64}$/.test(change.previousHash))) ||
    (change.nextHash !== null &&
      (typeof change.nextHash !== "string" ||
        !/^[a-f0-9]{64}$/.test(change.nextHash))) ||
    (next?.id ?? change.projectId) !== change.projectId ||
    projectHash(next) !== change.nextHash ||
    key !==
      projectChangeKey(
        organizationId,
        change.projectId,
        change.previousHash ?? null,
        change.nextHash ?? null,
        resolvesConflict,
      )
  )
    throw new HttpError(503, "The project registry change log is invalid.");
  try {
    identifier.parse(change.projectId);
  } catch {
    throw new HttpError(503, "The project registry change log is invalid.");
  }
  return {
    version: change.version as 1 | 2,
    organizationId,
    projectId: change.projectId,
    previousHash: change.previousHash ?? null,
    nextHash: change.nextHash ?? null,
    next,
    ...(resolvesConflict ? { resolvesConflict: true } : {}),
  };
}

async function projectRegistryProjection(organizationId: string) {
  const store = contentStore();
  const baseline = validateProjects(
    (await store.get<unknown>(registryKey(organizationId))) ?? [],
    organizationId,
  );
  const projects = new Map<string, ProjectRecord>(
    baseline.map((project) => [project.id, project]),
  );
  const prefix = registryChangePrefix(organizationId);
  const keys = await store.list(prefix);
  const changes = await mapRegistryChanges(keys, organizationId, store);
  const grouped = new Map<string, ProjectRegistryChange[]>();
  for (const change of changes) {
    const group = grouped.get(change.projectId) ?? [];
    group.push(change);
    grouped.set(change.projectId, group);
  }

  const conflictedProjectIds = new Set<string>();
  for (const [projectId, history] of grouped) {
    let current: ProjectRecord | null = projects.get(projectId) ?? null;
    const pending = [...history];
    let unresolvedConflict = false;
    while (pending.length) {
      const currentHash = projectHash(current);
      if (unresolvedConflict) {
        const resolution = pending.find(
          (change) =>
            change.resolvesConflict &&
            change.previousHash === currentHash &&
            change.nextHash === currentHash,
        );
        if (resolution) {
          pending.splice(pending.indexOf(resolution), 1);
          unresolvedConflict = false;
          continue;
        }
      }
      const eligible = pending.filter(
        (change) =>
          !change.resolvesConflict && change.previousHash === currentHash,
      );
      if (!eligible.length)
        throw new HttpError(
          409,
          `Concurrent changes conflict for project ${projectId}. Reload the project catalog and retry.`,
        );
      const outcomes = new Set(eligible.map((change) => change.nextHash));
      if (outcomes.size > 1) {
        // Spaces has no compare-and-swap write for these immutable edges. A race
        // must not make every project lookup in the organization fail. Select a
        // stable branch, expose a warning, and ignore the losing branch's tail.
        eligible.sort((left, right) => {
          if (left.nextHash === null) return right.nextHash === null ? 0 : 1;
          if (right.nextHash === null) return -1;
          return left.nextHash.localeCompare(right.nextHash);
        });
        const chosen = eligible[0];
        const discardedHashes = new Set(
          eligible
            .filter((change) => change.nextHash !== chosen.nextHash)
            .map((change) => change.nextHash),
        );
        for (const change of eligible)
          pending.splice(pending.indexOf(change), 1);
        let removed = true;
        while (removed) {
          removed = false;
          for (let index = pending.length - 1; index >= 0; index--) {
            const change = pending[index];
            if (!discardedHashes.has(change.previousHash)) continue;
            pending.splice(index, 1);
            if (change.nextHash !== null) discardedHashes.add(change.nextHash);
            removed = true;
          }
        }
        current = chosen.next;
        unresolvedConflict = true;
        continue;
      }
      current = eligible[0].next;
      for (const change of eligible) pending.splice(pending.indexOf(change), 1);
      // A subsequent immutable edge from the displayed branch represents an
      // administrator re-saving that project after seeing the warning.
      if (unresolvedConflict) unresolvedConflict = false;
    }
    if (current) projects.set(projectId, current);
    else projects.delete(projectId);
    if (unresolvedConflict) conflictedProjectIds.add(projectId);
  }
  return {
    projects: validateProjects([...projects.values()], organizationId),
    conflictedProjectIds,
  } satisfies ProjectRegistryProjection;
}

async function mapRegistryChanges(
  keys: string[],
  organizationId: string,
  store: Store,
) {
  const prefix = registryChangePrefix(organizationId);
  const validKeys = keys.filter((key) => key.startsWith(prefix));
  const values = await Promise.all(
    validKeys.map(async (key) => ({
      key,
      value: await store.get<unknown>(key),
    })),
  );
  return values.map(({ key, value }) => {
    if (value === null)
      throw new HttpError(
        503,
        "The project registry change log is incomplete.",
      );
    return parseRegistryChange(value, key, organizationId);
  });
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

export async function writeProjectRegistry(
  rawOrganizationId: string,
  projects: unknown,
  options: { onlyIfMissing?: boolean } = {},
) {
  const organizationId = parsedOrganizationId(rawOrganizationId);
  const validated = validateProjects(projects, organizationId);
  return withRegistryMutationLock(organizationId, async () => {
    const store = contentStore();
    const key = registryKey(organizationId);
    if (options.onlyIfMissing) {
      if ((await store.get<unknown>(key)) !== null)
        throw new HttpError(
          409,
          `A project registry already exists for ${organizationId}.`,
        );
      const deletingIds = await deletingProjectIds(organizationId);
      if (validated.some((project) => deletingIds.has(project.id)))
        throw new HttpError(
          409,
          "A permanently deleted project ID cannot be reused.",
        );
      const protectedProjects = await preserveDeletionMarkers(
        organizationId,
        validated,
        deletingIds,
      );
      const projection = await projectRegistryProjection(organizationId);
      const current = projection.projects;
      const requestedById = new Map(
        protectedProjects.map((project) => [project.id, project]),
      );
      if (
        current.some(
          (project) =>
            projectHash(project) !==
            projectHash(requestedById.get(project.id) ?? null),
        ) ||
        current.length > protectedProjects.length
      )
        throw new HttpError(
          409,
          `A project registry already exists for ${organizationId}.`,
        );
      // This also resumes an interrupted immutable migration when every existing
      // entry agrees with the requested registry.
      return appendProjectRegistryChanges(
        organizationId,
        current,
        protectedProjects,
      );
    }
    const projection = await projectRegistryProjection(organizationId);
    return appendProjectRegistryChanges(
      organizationId,
      projection.projects,
      validated,
    );
  });
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

async function appendProjectRegistryChanges(
  organizationId: string,
  base: ProjectRecord[],
  requested: ProjectRecord[],
  resolveProjectIds = new Set<string>(),
) {
  const store = contentStore();
  const baseById = new Map(base.map((project) => [project.id, project]));
  const nextById = new Map(requested.map((project) => [project.id, project]));
  const projectIds = new Set([...baseById.keys(), ...nextById.keys()]);

  await Promise.all(
    [...projectIds].map(async (projectId) => {
      const previous = baseById.get(projectId) ?? null;
      const next = nextById.get(projectId) ?? null;
      const previousHash = projectHash(previous);
      const nextHash = projectHash(next);
      const resolvesConflict =
        previousHash === nextHash && resolveProjectIds.has(projectId);
      if (previousHash === nextHash && !resolvesConflict) return;
      const change: ProjectRegistryChange = {
        version: resolvesConflict ? 2 : 1,
        organizationId,
        projectId,
        previousHash,
        nextHash,
        next,
        ...(resolvesConflict ? { resolvesConflict: true } : {}),
      };
      const key = projectChangeKey(
        organizationId,
        projectId,
        previousHash,
        nextHash,
        resolvesConflict,
      );
      const existing = await store.get<unknown>(key);
      if (existing !== null) {
        parseRegistryChange(existing, key, organizationId);
        return;
      }
      await store.put(key, change);
    }),
  );
  return (await projectRegistryProjection(organizationId)).projects;
}
