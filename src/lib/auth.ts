import "server-only";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
  randomUUID,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { append, events } from "./events";
import { controlStore, mapBounded, type Store } from "./storage";
import { HttpError, projects, projectById } from "./config";
import { usernameSchema } from "./username";
import type { Actor, Role, User } from "./types";
const scrypt = promisify(scryptCallback);
const cookieName =
  process.env.NODE_ENV === "production"
    ? "__Host-postparticle"
    : "postparticle";
const ttl = 60 * 60 * 8;
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [salt, hash] = encoded.split(":");
  if (!salt || !hash || !/^[a-f0-9]{128}$/.test(hash)) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
export async function getUser(
  username: string,
  store = controlStore(),
): Promise<User | null> {
  const normalizedUsername = usernameSchema.parse(username);
  const user = await rawUser(normalizedUsername, store);
  if (!user || !user.platformAdmin) return user ?? null;

  // Bootstrap claims are immutable so simultaneous initializations converge on
  // one effective platform administrator without a storage transaction.
  const initialAdmin = (
    await events<{ username: string }>(store, "bootstrap/platform-admins")
  ).find((event) => event.action === "claim")?.data.username;
  return initialAdmin
    ? { ...user, platformAdmin: user.username === initialAdmin }
    : user;
}

async function rawUser(username: string, store: Store): Promise<User | null> {
  const history = await events<User>(store, `users/${username}`);
  return history.at(-1)?.data ?? null;
}

async function userNames(store: Store) {
  const keys = await store.list("users/");
  return [...new Set(keys.map((key) => key.split("/")[1]))];
}
export async function saveUser(
  actor: string,
  user: User,
  store = controlStore(),
) {
  const username = usernameSchema.parse(user.username);
  await append(store, `users/${username}`, actor, "user", {
    ...user,
    username,
  });
}
export async function listUsers(store = controlStore()) {
  const names = await userNames(store);
  return (await mapBounded(names, (n) => getUser(n, store))).filter(
    (v): v is User => !!v,
  );
}
export async function membership(
  username: string,
  projectId: string,
  store = controlStore(),
): Promise<Role | null> {
  username = usernameSchema.parse(username);
  const history = await events<Role | null>(
    store,
    `memberships/${projectId}/${username}`,
  );
  return history.at(-1)?.data ?? null;
}
export async function setMembership(
  actor: string,
  username: string,
  projectId: string,
  role: Role | null,
  store = controlStore(),
) {
  projectById(projectId);
  username = usernameSchema.parse(username);
  await append(
    store,
    `memberships/${projectId}/${username}`,
    actor,
    "membership",
    role,
  );
}
export async function allowedProjects(actor: Actor) {
  return (
    await Promise.all(
      projects.map(async (p) => ({
        ...p,
        role: actor.platformAdmin
          ? ("admin" as const)
          : await membership(actor.username, p.id),
      })),
    )
  ).filter((p) => p.role);
}
interface Session {
  username: string;
  version: string;
  expiresAt: number;
}
const sessionKey = (token: string) =>
  `sessions/${createHash("sha256").update(token).digest("hex")}.json`;
export async function createSession(user: User, store = controlStore()) {
  const token = randomBytes(32).toString("hex");
  await store.put(sessionKey(token), {
    username: user.username,
    version: user.sessionVersion,
    expiresAt: Date.now() + ttl * 1000,
  });
  return token;
}
export async function sessionUser(
  token: string | undefined,
  store: Store = controlStore(),
) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await store.get<Session>(sessionKey(token));
  if (!session || session.expiresAt <= Date.now()) return null;
  const user = await getUser(session.username, store);
  if (!user || user.disabled || user.sessionVersion !== session.version)
    return null;
  return {
    username: user.username,
    platformAdmin: user.platformAdmin,
  } satisfies Actor;
}
export async function currentActor() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  return sessionUser(token);
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
  store = controlStore(),
) {
  projectById(projectId);
  const role = actor.platformAdmin
    ? "admin"
    : await membership(actor.username, projectId, store);
  if (!role || (write && role === "viewer") || (admin && role !== "admin"))
    throw new HttpError(403, "You do not have permission for this action");
  return role;
}
export async function login(username: string, password: string) {
  const user = await getUser(username);
  // A fixed dummy hash keeps unknown accounts on the same expensive verification path.
  const valid = await verifyPassword(
    password,
    user?.passwordHash ?? `${"0".repeat(32)}:${"0".repeat(128)}`,
  );
  if (!valid || !user || user.disabled)
    throw new HttpError(401, "Invalid username or password");
  const token = await createSession(user);
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttl,
  });
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await controlStore().remove(sessionKey(token));
  jar.set(cookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
export async function revokeUserSessions(actor: string, username: string) {
  const user = await getUser(username);
  if (!user) throw new HttpError(404, "Account not found");
  await saveUser(actor, { ...user, sessionVersion: randomUUID() });
}

export async function resetUserPassword(
  actor: string,
  username: string,
  password: string,
  store = controlStore(),
) {
  if (password.length < 12 || password.length > 256)
    throw new HttpError(400, "Use a password between 12 and 256 characters");
  const user = await getUser(username, store);
  if (!user) throw new HttpError(404, "Account not found");
  await saveUser(
    actor,
    {
      ...user,
      passwordHash: await hashPassword(password),
      sessionVersion: randomUUID(),
    },
    store,
  );
}
