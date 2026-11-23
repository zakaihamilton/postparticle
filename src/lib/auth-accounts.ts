import "server-only";
import { requireActor, requirePerministerToken } from "./auth-session";
import { HttpError } from "./config";
import {
  type PerministerAccount,
  perministerAccounts,
  perministerChangePassword,
  perministerCreateAccount,
  perministerProjectMembers,
  perministerSetProjectMember,
  perministerUpdateAccount,
} from "./perminister-integration";
import { getProject, productionVisible } from "./projects";
import type { Actor, Role } from "./types";
import { usernameSchema } from "./username";

export interface ManagedAccount {
  username: string;
  subjectId: string;
  platformAdmin: boolean;
  disabled: boolean;
}

export function minimumAccountPasswordLength() {
  return 15;
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
  return perministerUpdateAccount(
    token,
    actor.organizationId,
    account.subjectId,
    {
      ...(input.disabled === undefined
        ? {}
        : { status: input.disabled ? "disabled" : "active" }),
      ...(input.password === undefined ? {} : { password: input.password }),
    },
  );
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
    await perministerAccounts(
      await requirePerministerToken(),
      actor.organizationId,
    )
  ).find((candidate) => candidate.username === normalizedUsername);
  return account ? userFromPerministerAccount(account) : null;
}

export async function listUsers(): Promise<ManagedAccount[]> {
  const actor = await requireActor();
  return (
    await perministerAccounts(
      await requirePerministerToken(),
      actor.organizationId,
    )
  ).map(userFromPerministerAccount);
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
  const project = await getProject(organizationId, projectId);
  if (!productionVisible(project))
    throw new HttpError(404, "Project not found");
  username = usernameSchema.parse(username);
  const token = await requirePerministerToken();
  const member = role
    ? undefined
    : (await perministerProjectMembers(token, organizationId, projectId)).find(
        (candidate) => matchesPerministerMember(candidate, username),
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

export async function revokeProjectGrantsForDeletion(
  actor: Actor,
  projectId: string,
) {
  const project = await getProject(actor.organizationId, projectId, {
    includeArchived: true,
    includeDeleting: true,
  });
  if (!project.deleting)
    throw new HttpError(409, "The project is not being deleted.");
  const token = await requirePerministerToken();
  const members = await perministerProjectMembers(
    token,
    actor.organizationId,
    projectId,
  );
  await Promise.all(
    members.map((member) =>
      perministerSetProjectMember(
        token,
        actor.organizationId,
        projectId,
        member.username ?? member.email ?? member.subjectId,
        null,
        member.subjectId,
      ),
    ),
  );
}

export async function projectMemberAccounts(
  organizationId: string,
  projectId: string,
) {
  const token = await requirePerministerToken();
  const [members, accounts] = await Promise.all([
    perministerProjectMembers(token, organizationId, projectId),
    perministerAccounts(token, organizationId),
  ]);
  const accountBySubject = new Map(
    accounts.map((account) => [account.subjectId, account]),
  );
  return members.flatMap((member) => {
    const account = accountBySubject.get(member.subjectId);
    if (!account)
      throw new HttpError(
        503,
        "Perminister did not return account status for a project member.",
      );
    const role = ["admin", "editor", "viewer"].includes(member.role)
      ? (member.role as Role)
      : null;
    return [
      {
        username: usernameSchema.parse(account.username),
        disabled: account.status === "disabled",
        accessActive: member.active,
        role,
      },
    ];
  });
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
