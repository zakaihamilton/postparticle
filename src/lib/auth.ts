import "server-only";

import { cookies } from "next/headers";
import {
  HttpError,
  organizationIdentifier,
  projects,
  projectById,
} from "./config";
import { usernameSchema } from "./username";
import type { Actor, Role } from "./types";
import {
  perministerAccounts,
  perministerAuthorize,
  perministerChangePassword,
  perministerCreateAccount,
  perministerLogin,
  perministerLogout,
  perministerProjectMembers,
  perministerRoleForProject,
  perministerSession,
  perministerSetProjectMember,
  perministerUpdateAccount,
  type PerministerAccount,
  type PerministerSession,
} from "./perminister-integration";

const cookieName =
  process.env.NODE_ENV === "production"
    ? "__Host-postparticle"
    : "postparticle";
const organizationCookieName =
  process.env.NODE_ENV === "production"
    ? "__Host-postparticle-organization"
    : "postparticle-organization";
const defaultSessionSeconds = 60 * 60 * 8;

export interface ManagedAccount {
  username: string;
  subjectId: string;
  platformAdmin: boolean;
  disabled: boolean;
}

export function minimumAccountPasswordLength() {
  return 15;
}

export async function currentSessionToken() {
  return (await cookies()).get(cookieName)?.value;
}

async function requirePerministerToken() {
  const token = await currentSessionToken();
  if (!token) throw new HttpError(401, "Please sign in");
  return token;
}

function userFromPerministerAccount(
  account: PerministerAccount,
): ManagedAccount {
  return {
    username: usernameSchema.parse(account.username),
    subjectId: account.subjectId,
    platformAdmin: account.platformAdmin,
    disabled: account.status === "disabled",
  };
}

function actorFromPerministerSession(
  session: PerministerSession,
  selectedOrganizationId?: string,
): Actor | null {
  const username =
    session.account.username ??
    session.account.email ??
    session.account.loginIdentifier;
  if (!username) return null;
  const organizations = session.organizations
    .filter((organization) => organization.productId === "postparticle")
    .map((organization) => ({
      organizationId: organization.organizationId.toLowerCase(),
      organizationName: organization.organizationName,
      platformAdmin: organization.platformAdmin,
    }));
  const activeOrganization =
    organizations.find(
      (organization) =>
        organization.organizationId === selectedOrganizationId?.toLowerCase(),
    ) ?? organizations[0];
  if (!activeOrganization) return null;
  return {
    username: usernameSchema.parse(username),
    organizationId: activeOrganization.organizationId,
    organizationName: activeOrganization.organizationName,
    organizations,
    platformAdmin: activeOrganization.platformAdmin,
  };
}

function perministerRole(
  session: PerministerSession,
  organizationId: string,
  projectId: string,
): Role | null {
  return perministerRoleForProject(session, organizationId, projectId);
}

function matchesPerministerMember(
  member: { username: string | null; email: string | null },
  username: string,
) {
  const normalizedUsername = username.toLowerCase();
  return [member.username, member.email].some(
    (identity) => identity?.toLowerCase() === normalizedUsername,
  );
}

export async function createPerministerAccount(
  username: string,
  password: string,
) {
  const actor = await requireActor();
  const token = await requirePerministerToken();
  const accounts = await perministerAccounts(token, actor.organizationId);
  if (accounts.some((account) => account.username === username)) {
    throw new HttpError(409, "Account already exists");
  }
  const email = username.includes("@") ? username : undefined;
  return perministerCreateAccount(token, actor.organizationId, {
    username,
    password,
    email,
  });
}

export async function updatePerministerAccount(
  username: string,
  input: {
    disabled?: boolean;
    password?: string;
  },
) {
  const actor = await requireActor();
  const token = await requirePerministerToken();
  const account = (await perministerAccounts(token, actor.organizationId)).find(
    (candidate) => candidate.username === username,
  );
  if (!account) throw new HttpError(404, "Account not found");
  return perministerUpdateAccount(token, actor.organizationId, account.subjectId, {
    ...(input.disabled === undefined
      ? {}
      : { status: input.disabled ? "disabled" : "active" }),
    ...(input.password === undefined ? {} : { password: input.password }),
  });
}

export async function changePerministerPassword(
  currentPassword: string,
  newPassword: string,
) {
  await perministerChangePassword(
    await requirePerministerToken(),
    currentPassword,
    newPassword,
  );
}

export async function getUser(
  username: string,
): Promise<ManagedAccount | null> {
  const normalizedUsername = usernameSchema.parse(username);
  const actor = await requireActor();
  const account = (
    await perministerAccounts(await requirePerministerToken(), actor.organizationId)
  ).find((candidate) => candidate.username === normalizedUsername);
  return account ? userFromPerministerAccount(account) : null;
}

export async function listUsers(): Promise<ManagedAccount[]> {
  const actor = await requireActor();
  return (
    await perministerAccounts(await requirePerministerToken(), actor.organizationId)
  ).map(
    userFromPerministerAccount,
  );
}

export async function membership(
  username: string,
  organizationId: string,
  projectId: string,
): Promise<Role | null> {
  const normalizedUsername = usernameSchema.parse(username).toLowerCase();
  const member = (
    await perministerProjectMembers(
      await requirePerministerToken(),
      organizationId,
      projectId,
    )
  ).find((candidate) =>
    matchesPerministerMember(candidate, normalizedUsername),
  );
  return member?.active && ["admin", "editor", "viewer"].includes(member.role)
    ? (member.role as Role)
    : null;
}

export async function setMembership(
  username: string,
  organizationId: string,
  projectId: string,
  role: Role | null,
) {
  projectById(projectId);
  username = usernameSchema.parse(username);
  const token = await requirePerministerToken();
  const member = role
    ? undefined
    : (await perministerProjectMembers(token, organizationId, projectId)).find((candidate) =>
        matchesPerministerMember(candidate, username),
      );
  await perministerSetProjectMember(
    token,
    organizationId,
    projectId,
    username,
    role,
    member?.subjectId,
  );
}

export async function allowedProjects(actor: Actor) {
  const token = await requirePerministerToken();
  const session = await perministerSession(token);
  if (!session) throw new HttpError(401, "Please sign in");
  const accessible = await Promise.all(
    projects.map(async (project) => {
      if (
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
        ...project,
        role:
          perministerRole(session, actor.organizationId, project.id) ??
          (actor.platformAdmin ? ("admin" as const) : ("viewer" as const)),
      };
    }),
  );
  return accessible.filter((project) => project !== null);
}

export async function projectMemberAccounts(
  organizationId: string,
  projectId: string,
) {
  const members = await perministerProjectMembers(
    await requirePerministerToken(),
    organizationId,
    projectId,
  );
  return members.flatMap((member) => {
    const username = member.username ?? member.email;
    if (!username) return [];
    const role = ["admin", "editor", "viewer"].includes(member.role)
      ? (member.role as Role)
      : null;
    return [
      {
        username,
        disabled: false,
        accessActive: member.active,
        role,
      },
    ];
  });
}

export async function sessionUser(
  token: string | undefined,
  selectedOrganizationId?: string,
) {
  if (!token) return null;
  const session = await perministerSession(token);
  return session
    ? actorFromPerministerSession(session, selectedOrganizationId)
    : null;
}

export async function currentActor() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (!token) return null;
  const selectedOrganizationId = jar.get(organizationCookieName)?.value;
  return sessionUser(token, selectedOrganizationId);
}

export async function requireActor() {
  const actor = await currentActor();
  if (!actor) throw new HttpError(401, "Please sign in");
  return actor;
}

export async function authorize(
  actor: Actor,
  projectId: string,
  write = false,
  admin = false,
) {
  projectById(projectId);
  const token = await requirePerministerToken();
  const action = admin
    ? "postparticle:members:manage"
    : write
      ? "postparticle:project:write"
      : "postparticle:project:read";
  if (
    !(await perministerAuthorize(
      token,
      actor.organizationId,
      projectId,
      action,
    ))
  ) {
    throw new HttpError(403, "You do not have permission for this action");
  }
  const session = await perministerSession(token);
  if (!session) throw new HttpError(401, "Please sign in");
  return (
    perministerRole(session, actor.organizationId, projectId) ??
    (actor.platformAdmin
      ? "admin"
      : admin
        ? "admin"
        : write
          ? "editor"
          : "viewer")
  );
}

export async function login(username: string, password: string) {
  const { token, expiresAt } = await perministerLogin(username, password);
  const parsedExpiry = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const remaining = Number.isFinite(parsedExpiry)
    ? Math.floor((parsedExpiry - Date.now()) / 1000)
    : defaultSessionSeconds;
  if (remaining <= 0)
    throw new HttpError(401, "Your Perminister session has expired.");
  const session = await perministerSession(token);
  const actor = session ? actorFromPerministerSession(session) : null;
  if (!actor) {
    await perministerLogout(token).catch(() => undefined);
    throw new HttpError(403, "No PostParticle organization access was found.");
  }
  const jar = await cookies();
  jar.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.min(remaining, 60 * 60 * 24 * 90),
  });
  jar.set(organizationCookieName, actor.organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.min(remaining, 60 * 60 * 24 * 90),
  });
}

export async function selectOrganization(rawOrganizationId: string) {
  const organizationId = organizationIdentifier.parse(rawOrganizationId).toLowerCase();
  const token = await requirePerministerToken();
  const actor = await sessionUser(token, organizationId);
  if (!actor || actor.organizationId !== organizationId)
    throw new HttpError(403, "You do not have access to this organization.");
  (await cookies()).set(organizationCookieName, organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  try {
    if (token) await perministerLogout(token);
  } catch {
    // Local sign-out must still complete if the central session is already
    // invalid or Perminister is temporarily unavailable.
  } finally {
    jar.set(cookieName, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    jar.set(organizationCookieName, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
}

export async function revokeUserSessions(username: string) {
  const actor = await requireActor();
  const user = await getUser(username);
  if (!user) throw new HttpError(404, "Account not found");
  await perministerUpdateAccount(
    await requirePerministerToken(),
    actor.organizationId,
    user.subjectId,
    {
      revokeSessions: true,
    },
  );
}

export async function resetUserPassword(username: string, password: string) {
  const minimumLength = minimumAccountPasswordLength();
  if (password.length < minimumLength || password.length > 256)
    throw new HttpError(
      400,
      `Use a password between ${minimumLength} and 256 characters`,
    );
  const actor = await requireActor();
  const user = await getUser(username);
  if (!user) throw new HttpError(404, "Account not found");
  await perministerUpdateAccount(
    await requirePerministerToken(),
    actor.organizationId,
    user.subjectId,
    {
      password,
    },
  );
}
