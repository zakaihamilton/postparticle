import { z } from "zod";
import { HttpError, identifier } from "@/lib/config";
import { json, readJson } from "@/lib/http";
import { revokeProjectGrantsForDeletion } from "@/lib/auth";
import { manageHandler, managePlatformAdmin } from "@/lib/manage-api";
import {
  beginProjectDeletion,
  getProject,
  getProjectDeletionMarker,
  projectStoreFor,
  updateProjectRegistry,
  type ProjectRecord,
} from "@/lib/projects";

type Context = { params: Promise<{ projectId: string }> };

export const PATCH = manageHandler(
  async (request: Request, context: Context) => {
    const actor = await managePlatformAdmin(request);
    const projectId = identifier.parse((await context.params).projectId);
    const input = z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().max(1000).optional(),
        production: z.boolean().optional(),
        archived: z.boolean().optional(),
      })
      .strict()
      .refine(
        (value) => Object.keys(value).length > 0,
        "Provide a project update.",
      )
      .parse(await readJson(request));
    let updated: ProjectRecord | undefined;
    await updateProjectRegistry(actor.organizationId, (projects) =>
      projects.map((project) => {
        if (project.id !== projectId) return project;
        if (project.deleting)
          throw new HttpError(
            409,
            "A project being deleted cannot be changed.",
          );
        const next: ProjectRecord = { ...project, ...input };
        updated = next;
        return next;
      }),
    );
    if (!updated) throw new HttpError(404, "Project not found");
    return json({ project: updated });
  },
);

export const DELETE = manageHandler(
  async (request: Request, context: Context) => {
    const actor = await managePlatformAdmin(request);
    const projectId = identifier.parse((await context.params).projectId);
    const { confirmation, organizationId } = z
      .object({ confirmation: z.string(), organizationId: z.string().uuid() })
      .strict()
      .parse(await readJson(request));
    if (organizationId.toLowerCase() !== actor.organizationId)
      throw new HttpError(
        409,
        "The active organization changed. Reload and retry.",
      );
    if (confirmation !== projectId)
      throw new HttpError(
        400,
        "Type the exact project ID to confirm deletion.",
      );
    let project: ProjectRecord;
    try {
      project = await getProject(actor.organizationId, projectId, {
        includeArchived: true,
        includeDeleting: true,
      });
    } catch (error) {
      if (
        error instanceof HttpError &&
        error.status === 404 &&
        (await getProjectDeletionMarker(actor.organizationId, projectId))
      )
        return json({ done: true, deletedObjects: 0 });
      throw error;
    }
    if (!project.archived)
      throw new HttpError(409, "Archive the project before deleting it.");

    const deletion = await beginProjectDeletion(
      actor.organizationId,
      projectId,
    );
    if (!project.deleting) {
      let marked = false;
      await updateProjectRegistry(actor.organizationId, (projects) =>
        projects.map((candidate) => {
          if (candidate.id !== projectId) return candidate;
          if (!candidate.archived)
            throw new HttpError(409, "Archive the project before deleting it.");
          marked = true;
          return { ...candidate, deleting: true };
        }),
      );
      if (!marked) throw new HttpError(404, "Project not found");
      project = await getProject(actor.organizationId, projectId, {
        includeArchived: true,
        includeDeleting: true,
      });
    }

    await revokeProjectGrantsForDeletion(actor, projectId);
    const retryAfterMs = deletion.cleanupNotBefore - Date.now();
    if (retryAfterMs > 0)
      return json({
        done: false,
        deletedObjects: 0,
        retryAfterMs: Math.min(retryAfterMs, 60_000),
      });

    const result = await projectStoreFor(
      actor.organizationId,
      project,
    ).purgePrefixBatch("");
    if (!result.done)
      return json({ done: false, deletedObjects: result.deleted });

    await updateProjectRegistry(actor.organizationId, (projects) =>
      projects.filter((candidate) => candidate.id !== projectId),
    );
    return json({ done: true, deletedObjects: result.deleted });
  },
);
