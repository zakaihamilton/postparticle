import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

const organizationId = "550e8400-e29b-41d4-a716-446655440000";
const productId = "postparticle";
const clientId = "550e8400-e29b-41d4-a716-446655440001";
const clientSecret = "test-client-secret";
const fixturePassword = "fixture-password-123";

interface Account {
  subjectId: string;
  username: string;
  email: string | null;
  password: string;
  status: "active" | "disabled";
  platformAdmin: boolean;
}

const accounts = new Map<string, Account>();
const memberships = new Map<string, string>();
const sessions = new Map<string, string>();

function addAccount(
  username: string,
  platformAdmin = false,
  projectRole?: { projectId: string; role: string },
) {
  const subjectId = randomUUID();
  const normalizedUsername = username.trim().toLowerCase();
  accounts.set(subjectId, {
    subjectId,
    username: normalizedUsername,
    email: normalizedUsername.includes("@") ? normalizedUsername : null,
    password: fixturePassword,
    status: "active",
    platformAdmin,
  });
  if (projectRole) {
    memberships.set(`${subjectId}:${projectRole.projectId}`, projectRole.role);
  }
  return subjectId;
}

addAccount("admin", true);
addAccount("editor", false, { projectId: "demo", role: "editor" });
addAccount("viewer", false, { projectId: "demo", role: "viewer" });
addAccount("outsider");

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => {
      try {
        resolve(
          JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
            string,
            unknown
          >,
        );
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function sessionAccount(request: IncomingMessage) {
  const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? "")?.[1];
  const subjectId = token ? sessions.get(token) : undefined;
  return subjectId ? accounts.get(subjectId) : undefined;
}

function projectRole(account: Account, projectId: string) {
  if (account.platformAdmin) return "admin";
  return memberships.get(`${account.subjectId}:${projectId}`) ?? null;
}

function canAuthorize(
  account: Account | undefined,
  projectId: string,
  action: string,
) {
  if (!account || account.status !== "active") return false;
  const role = projectRole(account, projectId);
  if (action === "postparticle:members:manage") return role === "admin";
  if (action === "postparticle:project:write")
    return role === "admin" || role === "editor";
  return role !== null;
}

function accountPayload(account: Account) {
  return {
    subjectId: account.subjectId,
    username: account.username,
    email: account.email,
    status: account.status,
    platformAdmin: account.platformAdmin,
  };
}

function memberPayload(account: Account, projectId: string) {
  return {
    subjectId: account.subjectId,
    username: account.username,
    email: account.email,
    active: account.status === "active",
    role: projectRole(account, projectId),
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:3102");
  if (request.method === "GET" && url.pathname === "/health") {
    send(response, 200, { ok: true });
    return;
  }
  if (
    request.headers["x-perminister-client-id"] !== clientId ||
    request.headers["x-perminister-client-secret"] !== clientSecret
  ) {
    send(response, 401, { error: "invalid_client" });
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/auth/consumer/login"
  ) {
    const body = await readJson(request);
    const identifier = String(body.identifier ?? "")
      .trim()
      .toLowerCase();
    const account = [...accounts.values()].find(
      (candidate) =>
        candidate.status === "active" &&
        (candidate.username === identifier || candidate.email === identifier),
    );
    if (!account || account.password !== body.password) {
      send(response, 401, { error: "invalid_credentials" });
      return;
    }
    const token = randomUUID();
    sessions.set(token, account.subjectId);
    send(response, 200, {
      authenticated: true,
      sessionToken: token,
      account: accountPayload(account),
      session: {
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      },
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/authorize") {
    const body = await readJson(request);
    const authorized = canAuthorize(
      sessionAccount(request),
      String(body.resourceId ?? ""),
      String(body.action ?? ""),
    );
    send(response, authorized ? 200 : 403, { authorized });
    return;
  }

  if (url.pathname === "/api/auth/consumer/session") {
    const account = sessionAccount(request);
    if (!account || account.status !== "active") {
      send(response, 401, { authenticated: false });
      return;
    }
    if (request.method === "DELETE") {
      const token = /^Bearer (.+)$/.exec(
        request.headers.authorization ?? "",
      )?.[1];
      if (token) sessions.delete(token);
      send(response, 200, { authenticated: false });
      return;
    }
    const resourceRoles = [...memberships.entries()]
      .filter(([key]) => key.startsWith(`${account.subjectId}:`))
      .map(([key, role]) => {
        const projectId = key.slice(account.subjectId.length + 1);
        const actions =
          role === "admin"
            ? [
                "postparticle:project:read",
                "postparticle:project:write",
                "postparticle:members:manage",
              ]
            : role === "editor"
              ? ["postparticle:project:read", "postparticle:project:write"]
              : ["postparticle:project:read"];
        return { scope: { kind: "project", projectId }, role, actions };
      });
    send(response, 200, {
      authenticated: true,
      account: accountPayload(account),
      session: {
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      },
      organizations: [
        {
          organizationId,
          productId,
          platformAdmin: account.platformAdmin,
          resourceRoles,
        },
      ],
    });
    return;
  }

  if (url.pathname === "/api/auth/consumer/accounts") {
    const actor = sessionAccount(request);
    if (!actor || actor.status !== "active" || !actor.platformAdmin) {
      send(response, 403, { error: "forbidden" });
      return;
    }
    if (request.method === "GET") {
      send(response, 200, {
        accounts: [...accounts.values()].map(accountPayload),
      });
      return;
    }
    if (request.method === "POST") {
      const body = await readJson(request);
      const username = String(body.username ?? "")
        .trim()
        .toLowerCase();
      const email =
        typeof body.email === "string" ? body.email.toLowerCase() : null;
      if (
        [...accounts.values()].some(
          (account) =>
            account.username === username || (email && account.email === email),
        )
      ) {
        send(response, 409, { error: "account_exists" });
        return;
      }
      const subjectId = randomUUID();
      accounts.set(subjectId, {
        subjectId,
        username,
        email,
        password: String(body.password ?? ""),
        status: "active",
        platformAdmin: false,
      });
      send(response, 201, { created: true, subjectId });
      return;
    }
  }

  const accountUpdate = /^\/api\/auth\/consumer\/accounts\/([^/]+)$/.exec(
    url.pathname,
  );
  if (accountUpdate && request.method === "PATCH") {
    const actor = sessionAccount(request);
    const account = accounts.get(decodeURIComponent(accountUpdate[1]));
    if (!actor?.platformAdmin || !account) {
      send(response, account ? 403 : 404, { error: "not_found" });
      return;
    }
    const body = await readJson(request);
    if (body.status === "active" || body.status === "disabled")
      account.status = body.status;
    if (typeof body.password === "string") account.password = body.password;
    if (body.revokeSessions === true) {
      for (const [token, subjectId] of sessions) {
        if (subjectId === account.subjectId) sessions.delete(token);
      }
    }
    send(response, 200, { updated: true });
    return;
  }

  if (
    request.method === "PATCH" &&
    url.pathname === "/api/auth/consumer/password"
  ) {
    const actor = sessionAccount(request);
    const body = await readJson(request);
    if (!actor || actor.password !== body.currentPassword) {
      send(response, 400, { error: "Current password is incorrect" });
      return;
    }
    actor.password = String(body.newPassword ?? "");
    send(response, 200, { updated: true });
    return;
  }

  if (url.pathname === "/api/auth/consumer/members") {
    const actor = sessionAccount(request);
    const projectId = url.searchParams.get("resourceId") ?? "";
    if (request.method === "GET") {
      if (!canAuthorize(actor, projectId, "postparticle:project:read")) {
        send(response, 403, { error: "forbidden" });
        return;
      }
      const members = [...accounts.values()].filter((account) =>
        memberships.has(`${account.subjectId}:${projectId}`),
      );
      send(response, 200, {
        members: members.map((account) => memberPayload(account, projectId)),
      });
      return;
    }
    if (request.method === "POST") {
      if (!canAuthorize(actor, projectId, "postparticle:members:manage")) {
        send(response, 403, { error: "forbidden" });
        return;
      }
      const body = await readJson(request);
      const username = String(body.username ?? body.email ?? "")
        .trim()
        .toLowerCase();
      const account = [...accounts.values()].find(
        (candidate) =>
          candidate.username === username || candidate.email === username,
      );
      if (!account) {
        send(response, 404, { error: "account_not_found" });
        return;
      }
      memberships.set(`${account.subjectId}:${projectId}`, String(body.role));
      send(response, 201, { created: true });
      return;
    }
  }

  const memberDelete = /^\/api\/auth\/consumer\/members\/([^/]+)$/.exec(
    url.pathname,
  );
  if (memberDelete && request.method === "DELETE") {
    const actor = sessionAccount(request);
    const body = await readJson(request);
    const projectId = String(body.resourceId ?? "");
    if (!canAuthorize(actor, projectId, "postparticle:members:manage")) {
      send(response, 403, { error: "forbidden" });
      return;
    }
    memberships.delete(`${decodeURIComponent(memberDelete[1])}:${projectId}`);
    send(response, 200, { removed: true });
    return;
  }

  send(response, 404, { error: "not_found" });
});

server.listen(3102, "127.0.0.1");
