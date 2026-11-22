import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { HttpError, identifier, organizationIdentifier } from "./config";
import { contentStore, type Store } from "./storage";
import type { Project } from "./types";

const registryChangePrefix = (organizationId: string) =>
  `organizations/${organizationId}/project-registry/changes/`;
const mutationTails = new Map<string, Promise<void>>();

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

export interface ProjectRegistryProjection {
  projects: ProjectRecord[];
  conflictedProjectIds: Set<string>;
}

export function parsedOrganizationId(value: string) {
  return organizationIdentifier.parse(value).toLowerCase();
}

export function validateProjects(value: unknown, organizationId: string) {
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

export async function withRegistryMutationLock<T>(
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

export async function projectRegistryProjection(organizationId: string) {
  const store = contentStore();
  const projects = new Map<string, ProjectRecord>();
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

export async function appendProjectRegistryChanges(
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
