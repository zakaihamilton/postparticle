import { z } from "zod";
import { HttpError, identifier } from "@/lib/config";
import { json, readJson } from "@/lib/http";
import { manageHandler, managePlatformAdmin } from "@/lib/manage-api";
import {
  getProjectRegistry,
  updateProjectRegistry,
  type ProjectRecord,
} from "@/lib/projects";

export const GET = manageHandler(async (request: Request) => {
  const actor = await managePlatformAdmin(request);
  return json({
    projects: await getProjectRegistry(actor.organizationId, {
      includeArchived: true,
      includeDeleting: true,
    }),
  });
});

export const POST = manageHandler(async (request: Request) => {
  const actor = await managePlatformAdmin(request);
  const input = z
    .object({
      id: identifier,
      name: z.string().trim().min(1).max(120),
      description: z.string().max(1000),
      production: z.boolean().default(true),
    })
    .strict()
    .parse(await readJson(request));
  let created: ProjectRecord | undefined;
  await updateProjectRegistry(actor.organizationId, (projects) => {
    if (projects.some((project) => project.id === input.id))
      throw new HttpError(409, "A project with this ID already exists.");
    const project: ProjectRecord = {
      ...input,
      archived: false,
      deleting: false,
    };
    created = project;
    return [...projects, project];
  });
  return json({ project: created }, 201);
});
