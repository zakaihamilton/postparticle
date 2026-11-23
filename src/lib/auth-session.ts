import "server-only";
import { cookies } from "next/headers";
import { HttpError, organizationIdentifier } from "./config";
import {
  type PerministerSession,
  perministerExchangeAuthorizationCode,
  perministerHasProductAdminAccess,
  perministerLogout,
  perministerSession,
} from "./perminister-integration";
import type { Actor } from "./types";
import { usernameSchema } from "./username";

const cookieName =
  process.env.NODE_ENV === "production"
    ? "__Host-postparticle"
    : "postparticle";
const organizationCookieName =
  process.env.NODE_ENV === "production"
    ? "__Host-postparticle-organization"
    : "postparticle-organization";
const defaultSessionSeconds = 60 * 60 * 8;

export interface AuthContext {
  actor: Actor;
  token: string;
  session: PerministerSession;
}

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

async function currentSessionToken() {
  return (await cookies()).get(cookieName)?.value;
}

export async function requirePerministerToken() {
  const token = await currentSessionToken();
  if (!token) throw new HttpError(401, "Please sign in");
  return token;
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
      platformAdmin: perministerHasProductAdminAccess(organization),
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

export async function currentAuthContext(): Promise<AuthContext | null> {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (!token) return null;
  const selectedOrganizationId = jar.get(organizationCookieName)?.value;
  const session = await perministerSession(token, selectedOrganizationId);
  if (!session) return null;
  const actor = actorFromPerministerSession(session, selectedOrganizationId);
  return actor ? { actor, token, session } : null;
}

export async function requireAuthContext() {
  const context = await currentAuthContext();
  if (!context) throw new HttpError(401, "Please sign in");
  return context;
}

export async function currentActor() {
  return (await currentAuthContext())?.actor ?? null;
}

export async function requireActor() {
  return (await requireAuthContext()).actor;
}

export async function loginWithPerministerAuthorizationCode(
  code: string,
  codeVerifier: string,
  nonce: string,
  redirectUri: string,
) {
  const { accessToken, expiresAt } = await perministerExchangeAuthorizationCode(
    code,
    codeVerifier,
    nonce,
    redirectUri,
  );
  await establishPerministerSession(accessToken, expiresAt);
}

async function establishPerministerSession(token: string, expiresAt?: string) {
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
  const maxAge = Math.min(remaining, 60 * 60 * 24 * 90);
  const jar = await cookies();
  jar.set(cookieName, token, sessionCookieOptions(maxAge));
  jar.set(
    organizationCookieName,
    actor.organizationId,
    sessionCookieOptions(maxAge),
  );
}

export async function selectOrganization(rawOrganizationId: string) {
  const organizationId = organizationIdentifier
    .parse(rawOrganizationId)
    .toLowerCase();
  const token = await requirePerministerToken();
  const session = await perministerSession(token, organizationId);
  const actor = session
    ? actorFromPerministerSession(session, organizationId)
    : null;
  if (!actor || actor.organizationId !== organizationId)
    throw new HttpError(403, "You do not have access to this organization.");
  (await cookies()).set(
    organizationCookieName,
    organizationId,
    sessionCookieOptions(60 * 60 * 24 * 30),
  );
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
    jar.set(cookieName, "", sessionCookieOptions(0));
    jar.set(organizationCookieName, "", sessionCookieOptions(0));
  }
}
