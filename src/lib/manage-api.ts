import "server-only";
import { errorResponse } from "./http";
import { HttpError, identifier } from "./config";
import { authorize, requireActor } from "./auth";
import { projectStore } from "./storage";
import { sameOrigin } from "./http";

export function manageHandler<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function manageActor(request: Request) {
  if (request.method !== "GET") sameOrigin(request);
  return requireActor();
}

export async function managePlatformAdmin(request: Request) {
  const actor = await manageActor(request);
  if (!actor.platformAdmin)
    throw new HttpError(403, "Platform administrator access required");
  return actor;
}

export async function manageProject(
  request: Request,
  rawProjectId: string,
  admin = false,
) {
  const actor = await manageActor(request);
  const projectId = identifier.parse(rawProjectId);
  const role = await authorize(
    actor,
    projectId,
    request.method !== "GET",
    admin,
  );
  return {
    actor,
    projectId,
    role,
    store: projectStore(actor.organizationId, projectId),
  };
}
