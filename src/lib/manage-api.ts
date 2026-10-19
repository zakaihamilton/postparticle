import "server-only";
import { errorResponse } from "./http";
import { HttpError, identifier } from "./config";
import { authorizeProject, requireAuthContext } from "./auth";
import { sameOrigin } from "./http";
import { projectStoreFor } from "./projects";

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

export async function manageAuthenticatedContext(request: Request) {
  if (request.method !== "GET") sameOrigin(request);
  return requireAuthContext();
}

export async function managePlatformAdmin(request: Request) {
  const { actor } = await manageAuthenticatedContext(request);
  if (!actor.platformAdmin)
    throw new HttpError(403, "Platform administrator access required");
  return actor;
}

export async function manageProject(
  request: Request,
  rawProjectId: string,
  admin = false,
) {
  if (request.method !== "GET") sameOrigin(request);
  const context = await requireAuthContext();
  const actor = context.actor;
  const projectId = identifier.parse(rawProjectId);
  const { project, role } = await authorizeProject(
    context,
    projectId,
    request.method !== "GET",
    admin,
  );
  return {
    actor,
    projectId,
    project,
    role,
    store: projectStoreFor(actor.organizationId, project),
  };
}
