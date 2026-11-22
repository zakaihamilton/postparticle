import "server-only";
import type { AuthContext } from "./auth-session";
import { HttpError, identifier, organizationIdentifier } from "./config";
import {
  type PerministerSession,
  perministerAuthorize,
  perministerRoleForProject,
} from "./perminister-integration";
import {
  getProject,
  getProjectRegistry,
  type ProjectRecord,
  productionVisible,
} from "./projects";
import type { Role } from "./types";

function perministerRole(
  session: PerministerSession,
  organizationId: string,
  projectId: string,
): Role | null {
  return perministerRoleForProject(session, organizationId, projectId);
}

function roleForProject(
  context: AuthContext,
  project: ProjectRecord,
  write = false,
  admin = false,
): Role {
  const { actor, session } = context;
  const grantedRole = perministerRole(
    session,
    actor.organizationId,
    project.id,
  );
  if (actor.platformAdmin || grantedRole === "admin") return "admin";
  if (project.createdBySubjectId === session.account.subjectId) return "editor";
  return grantedRole ?? (admin ? "admin" : write ? "editor" : "viewer");
}

export async function allowedProjects(context: AuthContext) {
  const { actor, token } = context;
  const projects = (await getProjectRegistry(actor.organizationId)).filter(
    productionVisible,
  );
  const accessible = await Promise.all(
    projects.map(async (project) => {
      const createdByActor =
        project.createdBySubjectId === context.session.account.subjectId;
      if (
        !actor.platformAdmin &&
        !createdByActor &&
        !(await perministerAuthorize(
          token,
          actor.organizationId,
          project.id,
          "postparticle:project:read",
        ))
      ) {
        return null;
      }
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        role: roleForProject(context, project),
      };
    }),
  );
  return accessible.filter((project) => project !== null);
}

async function authorizeLoadedProject(
  context: AuthContext,
  organizationId: string,
  project: ProjectRecord,
  write = false,
  admin = false,
) {
  if (!productionVisible(project))
    throw new HttpError(404, "Project not found");
  const createdByActor =
    project.createdBySubjectId === context.session.account.subjectId;
  const authorized =
    context.actor.platformAdmin || (createdByActor && !admin)
      ? true
      : await perministerAuthorize(
          context.token,
          organizationId,
          project.id,
          admin
            ? "postparticle:members:manage"
            : write
              ? "postparticle:project:write"
              : "postparticle:project:read",
        );
  if (!authorized) {
    throw new HttpError(403, "You do not have permission for this action");
  }
  return {
    project,
    role: roleForProject(context, project, write, admin),
  };
}

export async function authorizeProject(
  context: AuthContext,
  projectId: string,
  write = false,
  admin = false,
) {
  const validProjectId = identifier.parse(projectId);
  const project = await getProject(
    context.actor.organizationId,
    validProjectId,
  );
  return authorizeLoadedProject(
    context,
    context.actor.organizationId,
    project,
    write,
    admin,
  );
}

export async function authorizeResolvedProject(
  context: AuthContext,
  rawOrganizationId: string,
  project: ProjectRecord,
  write = false,
  admin = false,
) {
  const organizationId = organizationIdentifier
    .parse(rawOrganizationId)
    .toLowerCase();
  if (
    context.actor.organizationId !== organizationId ||
    (project.legacyOrganizationId &&
      project.legacyOrganizationId.toLowerCase() !== organizationId)
  )
    throw new HttpError(403, "You do not have permission for this action");

  identifier.parse(project.id);
  return authorizeLoadedProject(context, organizationId, project, write, admin);
}
