import "server-only";

import { HttpError } from "./config";
import type { Role } from "./types";

const productId = "postparticle";
const requestTimeoutMs = 12_000;

interface PerministerOrganizationAccess {
  organizationId: string;
  organizationName: string;
  productId: string;
  platformAdmin: boolean;
  resourceRoles: Array<{
    scope: { kind: string; projectId?: string; productId?: string };
    role: string | null;
    actions: string[];
  }>;
}

export interface PerministerSession {
  account: {
    subjectId: string;
    email: string | null;
    username: string | null;
    loginIdentifier?: string;
  };
  session: { expiresAt?: string; createdAt?: string };
  organizations: PerministerOrganizationAccess[];
}

export interface PerministerAccount {
  subjectId: string;
  email: string | null;
  username: string;
  status: "active" | "disabled";
  platformAdmin: boolean;
}

export interface PerministerMember {
  subjectId: string;
  email: string | null;
  username: string | null;
  active: boolean;
  role: string;
}

interface AuthConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new HttpError(503, "Perminister is not configured.");
  return value;
}

function baseUrl() {
  const raw = requiredEnv("PERMINISTER_BASE_URL");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(503, "Perminister is not configured.");
  }
  if (
    (url.protocol !== "https:" &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new HttpError(503, "Perminister is not configured.");
  }
  return url.origin;
}

function authConfig(): AuthConfig {
  const clientId = requiredEnv("PERMINISTER_CLIENT_ID");
  const clientSecret = requiredEnv("PERMINISTER_CLIENT_SECRET");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      clientId,
    )
  ) {
    throw new HttpError(503, "Perminister is not configured.");
  }
  return {
    baseUrl: baseUrl(),
    clientId: clientId.toLowerCase(),
    clientSecret,
  };
}

export function perministerClientSecretForSso() {
  return authConfig().clientSecret;
}

export function perministerAuthorizationUrl(
  state: string,
  challenge: string,
): string {
  const config = authConfig();
  const appOrigin = new URL(requiredEnv("APP_ORIGIN")).origin;
  const redirectUri = new URL("/auth/perminister/callback", appOrigin);
  const url = new URL("/oauth/authorize", config.baseUrl);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri.toString(),
    response_type: "code",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function readResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  try {
    const parsed = asRecord(await response.json());
    if (parsed) return parsed;
  } catch {
    // A non-JSON response from the auth service is treated as an outage.
  }
  throw new HttpError(503, "Perminister returned an invalid response.");
}

function errorForResponse(
  status: number,
  payload: Record<string, unknown>,
  purpose: "login" | "session" | "operation",
) {
  const code = typeof payload.error === "string" ? payload.error : "";
  if (status === 401) {
    return new HttpError(
      401,
      purpose === "login"
        ? "Invalid username or password"
        : purpose === "session"
          ? "Please sign in"
          : "Please sign in again",
    );
  }
  if (status === 403) {
    if (purpose === "login" && code === "email_verification_required") {
      return new HttpError(403, "Verify your email address before signing in.");
    }
    return new HttpError(403, "You do not have permission for this action.");
  }
  if (status === 404)
    return new HttpError(404, "Account or resource not found");
  if (status === 409 || status === 400) {
    return new HttpError(
      status,
      code && code.length <= 300 ? code : "The request could not be completed.",
    );
  }
  if (status === 429)
    return new HttpError(429, "Too many attempts. Try again later.");
  return new HttpError(
    503,
    "Perminister authentication is temporarily unavailable.",
  );
}

async function request(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
    purpose?: "login" | "session" | "operation";
    acceptedStatuses?: number[];
    timeoutMs?: number;
  } = {},
): Promise<Record<string, unknown>> {
  const config = authConfig();
  const headers = new Headers({ Accept: "application/json" });
  headers.set("X-Perminister-Client-Id", config.clientId);
  headers.set("X-Perminister-Client-Secret", config.clientSecret);
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.body !== undefined)
    headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(new URL(path, config.baseUrl), {
      method: options.method ?? "GET",
      headers,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? requestTimeoutMs),
    });
  } catch {
    throw new HttpError(
      503,
      "Perminister authentication is temporarily unavailable.",
    );
  }
  const payload = await readResponse(response);
  if (!response.ok && !options.acceptedStatuses?.includes(response.status)) {
    throw errorForResponse(
      response.status,
      payload,
      options.purpose ?? "operation",
    );
  }
  return payload;
}

function authPath(path: string) {
  return `/api/auth/consumer/${path}`;
}

export async function perministerLogin(identifier: string, password: string) {
  const payload = await request(authPath("login"), {
    method: "POST",
    body: { identifier, password },
    purpose: "login",
  });
  const sessionToken = payload.sessionToken;
  const account = asRecord(payload.account);
  const session = asRecord(payload.session);
  if (
    payload.authenticated !== true ||
    typeof sessionToken !== "string" ||
    !sessionToken ||
    !account ||
    !session
  ) {
    throw new HttpError(503, "Perminister returned an invalid login response.");
  }
  return {
    token: sessionToken,
    expiresAt:
      typeof session.expiresAt === "string" ? session.expiresAt : undefined,
  };
}

export async function perministerExchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
) {
  const payload = await request(authPath("token"), {
    method: "POST",
    body: {
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
    },
    purpose: "login",
  });
  const sessionToken = payload.sessionToken;
  const session = asRecord(payload.session);
  if (
    payload.authenticated !== true ||
    typeof sessionToken !== "string" ||
    !sessionToken ||
    !session
  ) {
    throw new HttpError(
      503,
      "Perminister returned an invalid sign-in response.",
    );
  }
  return {
    token: sessionToken,
    expiresAt:
      typeof session.expiresAt === "string" ? session.expiresAt : undefined,
  };
}

export async function perministerSession(
  token: string,
): Promise<PerministerSession | null> {
  try {
    const payload = await request(authPath("session"), {
      token,
      purpose: "session",
    });
    if (payload.authenticated !== true) return null;
    const account = asRecord(payload.account);
    const session = asRecord(payload.session);
    if (
      !account ||
      !session ||
      typeof account.subjectId !== "string" ||
      !Array.isArray(payload.organizations)
    ) {
      throw new HttpError(
        503,
        "Perminister returned an invalid session response.",
      );
    }
    return payload as unknown as PerministerSession;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) return null;
    throw error;
  }
}

export async function perministerLogout(token: string) {
  await request(authPath("session"), { method: "DELETE", token });
}

export async function perministerAuthorize(
  token: string,
  organizationId: string,
  projectId: string,
  action: string,
) {
  const payload = await request("/api/authorize", {
    method: "POST",
    token,
    body: {
      organizationId,
      productId,
      resourceKind: "project",
      resourceId: projectId,
      action,
    },
    acceptedStatuses: [403],
  });
  return payload.authorized === true;
}

export function perministerRoleForProject(
  session: PerministerSession,
  organizationId: string,
  projectId: string,
): Role | null {
  const organization = session.organizations.find(
    (item) =>
      item.organizationId.toLowerCase() === organizationId.toLowerCase() &&
      item.productId === productId,
  );
  if (!organization) return null;
  if (organization.platformAdmin) return "admin";
  const grant = organization.resourceRoles.find(
    (item) =>
      item.scope.kind === "project" &&
      item.scope.projectId?.toLowerCase() === projectId.toLowerCase(),
  );
  if (!grant) return null;
  if (
    grant.role === "admin" ||
    grant.role === "editor" ||
    grant.role === "viewer"
  ) {
    return grant.role;
  }
  if (grant.actions.includes("postparticle:members:manage")) return "admin";
  if (grant.actions.includes("postparticle:project:write")) return "editor";
  if (grant.actions.includes("postparticle:project:read")) return "viewer";
  return null;
}

function organizationAccountsPath(organizationId: string) {
  return `${authPath("accounts")}?${new URLSearchParams({ organizationId })}`;
}

export async function perministerAccounts(
  token: string,
  organizationId: string,
): Promise<PerministerAccount[]> {
  const payload = await request(organizationAccountsPath(organizationId), {
    token,
  });
  if (!Array.isArray(payload.accounts)) {
    throw new HttpError(
      503,
      "Perminister returned an invalid account response.",
    );
  }
  return payload.accounts.map((value) => {
    const account = asRecord(value);
    if (
      !account ||
      typeof account.subjectId !== "string" ||
      typeof account.username !== "string" ||
      (account.status !== "active" && account.status !== "disabled")
    ) {
      throw new HttpError(
        503,
        "Perminister returned an invalid account response.",
      );
    }
    return {
      subjectId: account.subjectId,
      email: typeof account.email === "string" ? account.email : null,
      username: account.username,
      status: account.status,
      platformAdmin: account.platformAdmin === true,
    };
  });
}

export async function perministerCreateAccount(
  token: string,
  organizationId: string,
  input: { username: string; password: string; email?: string },
) {
  return request(authPath("accounts"), {
    method: "POST",
    token,
    body: {
      organizationId,
      username: input.username,
      password: input.password,
      ...(input.email ? { email: input.email } : {}),
    },
  });
}

export async function perministerUpdateAccount(
  token: string,
  organizationId: string,
  subjectId: string,
  input: {
    status?: "active" | "disabled";
    password?: string;
    revokeSessions?: boolean;
    platformAdmin?: boolean;
  },
) {
  return request(`${authPath("accounts")}/${encodeURIComponent(subjectId)}`, {
    method: "PATCH",
    token,
    body: { organizationId, ...input },
  });
}

export async function perministerChangePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
) {
  return request(authPath("password"), {
    method: "PATCH",
    token,
    body: { currentPassword, newPassword },
  });
}

function projectMembersPath(organizationId: string, projectId: string) {
  return `${authPath("members")}?${new URLSearchParams({
    organizationId,
    scopeKind: "project",
    resourceId: projectId,
  })}`;
}

export async function perministerProjectMembers(
  token: string,
  organizationId: string,
  projectId: string,
): Promise<PerministerMember[]> {
  const payload = await request(projectMembersPath(organizationId, projectId), {
    token,
  });
  if (!Array.isArray(payload.members)) {
    throw new HttpError(
      503,
      "Perminister returned an invalid member response.",
    );
  }
  return payload.members.map((value) => {
    const member = asRecord(value);
    if (
      !member ||
      typeof member.subjectId !== "string" ||
      typeof member.active !== "boolean" ||
      typeof member.role !== "string"
    ) {
      throw new HttpError(
        503,
        "Perminister returned an invalid member response.",
      );
    }
    return {
      subjectId: member.subjectId,
      email: typeof member.email === "string" ? member.email : null,
      username: typeof member.username === "string" ? member.username : null,
      active: member.active,
      role: member.role,
    };
  });
}

export async function perministerSetProjectMember(
  token: string,
  organizationId: string,
  projectId: string,
  username: string,
  role: Role | null,
  subjectId?: string,
) {
  const body = {
    organizationId,
    scopeKind: "project",
    resourceId: projectId,
  };
  if (role) {
    return request(authPath("members"), {
      method: "POST",
      token,
      body: {
        ...body,
        username,
        ...(username.includes("@") ? { email: username } : {}),
        role,
      },
    });
  }
  if (!subjectId) return { removed: false };
  return request(`${authPath("members")}/${encodeURIComponent(subjectId)}`, {
    method: "DELETE",
    token,
    body,
  });
}
