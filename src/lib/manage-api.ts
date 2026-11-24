import "server-only";
import { authorizeProject, requireAuthContext } from "./auth";
import { HttpError, identifier } from "./config";
import { errorResponse, sameOrigin } from "./http";
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

export type ProjectRouteContext = { params: Promise<{ projectId: string }> };

export function projectHandler(
  handler: (
    request: Request,
    project: Awaited<ReturnType<typeof manageProject>>,
  ) => Promise<Response>,
  admin = false,
) {
  return manageHandler(
    async (request: Request, context: ProjectRouteContext) => {
      const { projectId } = await context.params;
      return handler(request, await manageProject(request, projectId, admin));
    },
  );
}
