import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign as signBytes,
} from "node:crypto";
import { testOrganizationId } from "./organization";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

const organizationId = testOrganizationId;
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
const oauthCodes = new Map<
  string,
  {
    clientId: string;
    redirectUri: string;
    challenge: string;
    nonce: string;
    state: string;
    subjectId: string;
    createdAt: number;
  }
>();
const signingKeyId = "postparticle-e2e-key";
const { privateKey: oidcPrivateKey, publicKey: oidcPublicKey } =
  generateKeyPairSync("rsa", { modulusLength: 2048 });
const oidcPublicJwk = {
  ...oidcPublicKey.export({ format: "jwk" }),
  alg: "RS256",
  kid: signingKeyId,
  use: "sig",
};

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

function sendHtml(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
  });
  response.end(body);
}

function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () =>
      resolve(new URLSearchParams(Buffer.concat(chunks).toString("utf8"))),
    );
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function signTestIdToken(account: Account, nonce: string): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", typ: "JWT", kid: signingKeyId });
  const now = Math.floor(Date.now() / 1000);
  const payload = encode({
    iss: "http://127.0.0.1:3102",
    sub: account.subjectId,
    aud: clientId,
    iat: now,
    exp: now + 300,
    nonce,
    email: account.email,
    preferred_username: account.username,
  });
  const input = `${header}.${payload}`;
  const signature = signBytes("RSA-SHA256", Buffer.from(input), oidcPrivateKey).toString("base64url");
  return `${input}.${signature}`;
}

function validAuthorizationRequest(url: URL): boolean {
  return (
    url.searchParams.get("client_id") === clientId &&
    url.searchParams.get("response_type") === "code" &&
    url.searchParams.get("scope") === "openid profile email perminister_api" &&
    /^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("state") ?? "") &&
    /^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("nonce") ?? "") &&
    url.searchParams.get("code_challenge_method") === "S256" &&
    /^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("code_challenge") ?? "") &&
    url.searchParams.get("redirect_uri") ===
      "http://localhost:3100/auth/perminister/callback"
  );
}

function authorizationHtml(values: Record<string, string>, error = ""): string {
  const hidden = Object.entries(values)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`)
    .join("\n");
  return `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><title>Perminister sign-in</title></head>
    <body><main><h1>Perminister sign-in</h1>
      <p>Use your Perminister account to continue to PostParticle.</p>
      ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ""}
      <form action="/oauth/authorize/continue" method="post">
        ${hidden}
        <label>Username or email address <input name="identifier" autocomplete="username" required></label>
        <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
        <button type="submit">Log in</button>
      </form>
    </main></body></html>`;
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
  if (request.method === "GET" && url.pathname === "/.well-known/openid-configuration") {
    send(response, 200, {
      issuer: "http://127.0.0.1:3102",
      authorization_endpoint: "http://127.0.0.1:3102/oauth/authorize",
      token_endpoint: "http://127.0.0.1:3102/oauth/token",
      jwks_uri: "http://127.0.0.1:3102/.well-known/jwks.json",
      response_types_supported: ["code"],
      id_token_signing_alg_values_supported: ["RS256"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_basic"],
      scopes_supported: ["openid", "profile", "email", "perminister_api"],
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/.well-known/jwks.json") {
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "application/jwk-set+json; charset=utf-8",
    });
    response.end(JSON.stringify({ keys: [oidcPublicJwk] }));
    return;
  }
  if (request.method === "GET" && url.pathname === "/oauth/authorize") {
    if (!validAuthorizationRequest(url)) {
      send(response, 400, { error: "invalid_request" });
      return;
    }
    sendHtml(response, 200, authorizationHtml(Object.fromEntries(url.searchParams.entries())));
    return;
  }
  if (request.method === "POST" && url.pathname === "/oauth/authorize/continue") {
    const form = await readForm(request);
    const authorization = new URLSearchParams();
    for (const key of [
      "client_id", "redirect_uri", "response_type", "scope", "state", "nonce",
      "code_challenge", "code_challenge_method",
    ]) {
      const value = form.get(key);
      if (value !== null) authorization.set(key, value);
    }
    const authorizationUrl = new URL("/oauth/authorize", "http://127.0.0.1:3102");
    authorizationUrl.search = authorization.toString();
    if (!validAuthorizationRequest(authorizationUrl)) {
      send(response, 400, { error: "invalid_request" });
      return;
    }
    const identifier = (form.get("identifier") ?? "").trim().toLowerCase();
    const account = [...accounts.values()].find(
      (candidate) =>
        candidate.status === "active" &&
        (candidate.username === identifier || candidate.email === identifier),
    );
    if (!account || account.password !== form.get("password")) {
      sendHtml(response, 401, authorizationHtml(Object.fromEntries(authorization), "Invalid username or password."));
      return;
    }
    const code = randomBytes(32).toString("base64url");
    oauthCodes.set(code, {
      clientId,
      redirectUri: authorization.get("redirect_uri")!,
      challenge: authorization.get("code_challenge")!,
      nonce: authorization.get("nonce")!,
      state: authorization.get("state")!,
      subjectId: account.subjectId,
      createdAt: Date.now(),
    });
    const callback = new URL(authorization.get("redirect_uri")!);
    callback.search = new URLSearchParams({ code, state: authorization.get("state")! }).toString();
    response.writeHead(303, { "Cache-Control": "no-store", Location: callback.toString() });
    response.end();
    return;
  }
  if (request.method === "POST" && url.pathname === "/oauth/token") {
    const basic = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(request.headers.authorization ?? "");
    const credentials = basic ? Buffer.from(basic[1], "base64").toString("utf8") : "";
    const separator = credentials.indexOf(":");
    const authenticatedClient = separator >= 0 &&
      credentials.slice(0, separator) === clientId &&
      credentials.slice(separator + 1) === clientSecret;
    const form = await readForm(request);
    const codeValue = form.get("code") ?? "";
    const code = oauthCodes.get(codeValue);
    const verifier = form.get("code_verifier") ?? "";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    if (
      !authenticatedClient ||
      form.get("grant_type") !== "authorization_code" ||
      !code ||
      code.createdAt < Date.now() - 5 * 60 * 1000 ||
      code.clientId !== clientId ||
      code.redirectUri !== form.get("redirect_uri") ||
      code.challenge !== challenge
    ) {
      send(response, 400, { error: "invalid_grant" });
      return;
    }
    oauthCodes.delete(codeValue);
    const account = accounts.get(code.subjectId);
    if (!account || account.status !== "active") {
      send(response, 400, { error: "invalid_grant" });
      return;
    }
    const accessToken = randomBytes(32).toString("base64url");
    sessions.set(accessToken, account.subjectId);
    send(response, 200, {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 8 * 60 * 60,
      scope: "openid profile email perminister_api",
      id_token: signTestIdToken(account, code.nonce),
    });
    return;
  }

  if (
    request.headers["x-perminister-client-id"] !== clientId ||
    request.headers["x-perminister-client-secret"] !== clientSecret
  ) {
    send(response, 401, { error: "invalid_client" });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/authorize") {
    const body = await readJson(request);
    const authorized =
      body.organizationId === organizationId &&
      canAuthorize(
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
          organizationName: "SENTRY8",
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
      if (url.searchParams.get("organizationId") !== organizationId) {
        send(response, 403, { error: "forbidden" });
        return;
      }
      send(response, 200, {
        accounts: [...accounts.values()].map(accountPayload),
      });
      return;
    }
    if (request.method === "POST") {
      const body = await readJson(request);
      if (body.organizationId !== organizationId) {
        send(response, 403, { error: "forbidden" });
        return;
      }
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
    if (body.organizationId !== organizationId) {
      send(response, 403, { error: "forbidden" });
      return;
    }
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
    if (request.method === "GET") {
      const projectId = url.searchParams.get("resourceId") ?? "";
      if (
        url.searchParams.get("organizationId") !== organizationId ||
        !canAuthorize(actor, projectId, "postparticle:project:read")
      ) {
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
      const body = await readJson(request);
      const projectId = String(body.resourceId ?? "");
      if (
        body.organizationId !== organizationId ||
        !canAuthorize(actor, projectId, "postparticle:members:manage")
      ) {
        send(response, 403, { error: "forbidden" });
        return;
      }
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
    if (
      body.organizationId !== organizationId ||
      !canAuthorize(actor, projectId, "postparticle:members:manage")
    ) {
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
