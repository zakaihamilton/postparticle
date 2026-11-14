import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign as signBytes } from "node:crypto";
import {
  perministerAuthorize,
  perministerAuthorizationUrl,
  perministerExchangeAuthorizationCode,
  perministerRecoveryUrl,
  perministerRoleForProject,
  perministerSession,
} from "@/lib/perminister-integration";

const organizationId = "550e8400-e29b-41d4-a716-446655440000";
const clientId = "550e8400-e29b-41d4-a716-446655440001";

function configure() {
  vi.stubEnv("PERMINISTER_BASE_URL", "https://perminister.example");
  vi.stubEnv("PERMINISTER_APP_CLIENT_ID", clientId);
  vi.stubEnv("PERMINSITER_APP_CLIENT_SECRET", "server-only-client-secret");
  vi.stubEnv("APP_ORIGIN", "https://postparticle.example");
}

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const keyId = "test-signing-key";
const publicJwk = {
  ...(publicKey.export({ format: "jwk" }) as Record<string, string>),
  alg: "RS256",
  kid: keyId,
  use: "sig",
};

function signedIdToken(nonce: string, claims: Record<string, unknown> = {}): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", typ: "JWT", kid: keyId });
  const payload = encode({
    iss: "https://perminister.example",
    sub: "subject-1",
    aud: clientId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    nonce,
    ...claims,
  });
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${signBytes("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url")}`;
}

function oidcFetch(nonce: string, claims: Record<string, unknown> = {}) {
  return vi.fn()
    .mockResolvedValueOnce(Response.json({
      issuer: "https://perminister.example",
      authorization_endpoint: "https://perminister.example/oauth/authorize",
      token_endpoint: "https://perminister.example/oauth/token",
      jwks_uri: "https://perminister.example/.well-known/jwks.json",
      response_types_supported: ["code"],
      id_token_signing_alg_values_supported: ["RS256"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_basic"],
      scopes_supported: ["openid", "profile", "email", "perminister_api"],
    }))
    .mockResolvedValueOnce(Response.json({
      access_token: "opaque-access-token",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "openid profile email perminister_api",
      id_token: signedIdToken(nonce, claims),
    }))
    .mockResolvedValueOnce(Response.json({ keys: [publicJwk] }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Perminister consumer integration", () => {
  it("uses the configured origin for recovery and hides it when invalid", () => {
    configure();
    expect(perministerRecoveryUrl()).toBe(
      "https://perminister.example/forgot-password",
    );
    vi.stubEnv(
      "PERMINISTER_BASE_URL",
      "https://user:secret@perminister.example",
    );
    expect(perministerRecoveryUrl()).toBeNull();
    vi.stubEnv("PERMINISTER_BASE_URL", "");
    expect(perministerRecoveryUrl()).toBeNull();
  });
  it("creates a full OIDC authorization request with a personalized return callback", () => {
    configure();
    vi.stubEnv("NODE_ENV", "development");
    const destination = new URL(perministerAuthorizationUrl("a".repeat(43), "b".repeat(43), "c".repeat(43), "http://localhost:3000", "login"));
    expect(destination.origin).toBe("https://perminister.example");
    expect(destination.searchParams.get("scope")).toBe("openid profile email perminister_api");
    expect(destination.searchParams.get("state")).toBe("a".repeat(43));
    expect(destination.searchParams.get("nonce")).toBe("c".repeat(43));
    expect(destination.searchParams.get("prompt")).toBe("login");
    expect(destination.searchParams.get("redirect_uri")).toBe("http://localhost:3000/auth/perminister/callback");
  });

  it("exchanges the code with client_secret_basic and verifies the signed ID token", async () => {
    configure();
    const fetch = oidcFetch("nonce-value");
    vi.stubGlobal("fetch", fetch);

    await expect(
      perministerExchangeAuthorizationCode("auth-code", "v".repeat(43), "nonce-value", "https://postparticle.example/auth/perminister/callback"),
    ).resolves.toMatchObject({
      accessToken: "opaque-access-token",
    });
    const [url, init] = fetch.mock.calls[1] as [URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(String(url)).toBe("https://perminister.example/oauth/token");
    expect(headers.get("Authorization")).toBe(`Basic ${Buffer.from(`${clientId}:server-only-client-secret`).toString("base64")}`);
    expect(new URLSearchParams(String(init.body))).toEqual(new URLSearchParams({
      grant_type: "authorization_code",
      code: "auth-code",
      redirect_uri: "https://postparticle.example/auth/perminister/callback",
      code_verifier: "v".repeat(43),
    }));
  });

  it("rejects a correctly signed ID token with a mismatched nonce", async () => {
    configure();
    vi.stubGlobal("fetch", oidcFetch("different-nonce"));
    await expect(
      perministerExchangeAuthorizationCode("auth-code", "v".repeat(43), "expected-nonce", "https://postparticle.example/auth/perminister/callback"),
    ).rejects.toThrow("ID token validation failed");
  });

  it.each([
    ["issuer", { iss: "https://attacker.example" }],
    ["audience", { aud: "another-client" }],
    ["expiry", { exp: Math.floor(Date.now() / 1000) - 1 }],
  ])("rejects a signed ID token with a mismatched %s", async (_label, claims) => {
    configure();
    vi.stubGlobal("fetch", oidcFetch("expected-nonce", claims));
    await expect(
      perministerExchangeAuthorizationCode(
        "auth-code",
        "v".repeat(43),
        "expected-nonce",
        "https://postparticle.example/auth/perminister/callback",
      ),
    ).rejects.toThrow("ID token validation failed");
  });

  it("treats invalid central sessions as signed out", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ authenticated: false }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(perministerSession("expired-token")).resolves.toBeNull();
  });

  it("maps a central 403 to a denied project authorization", async () => {
    configure();
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authorized: false }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      perministerAuthorize(
        "session-token",
        organizationId,
        "journal",
        "postparticle:project:read",
      ),
    ).resolves.toBe(false);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({
      organizationId,
      productId: "postparticle",
      resourceKind: "project",
      resourceId: "journal",
      action: "postparticle:project:read",
    });
  });

  it("maps imported project roles and product-wide administrators", () => {
    const session = {
      account: { subjectId: "subject-id", email: null, username: "writer" },
      session: {},
      organizations: [
        {
          organizationId,
          organizationName: "Example Organization",
          productId: "postparticle",
          platformAdmin: false,
          resourceRoles: [
            {
              scope: { kind: "project", projectId: "journal" },
              role: "editor",
              actions: [
                "postparticle:project:read",
                "postparticle:project:write",
              ],
            },
          ],
        },
      ],
    };
    expect(perministerRoleForProject(session, organizationId, "journal")).toBe(
      "editor",
    );
    expect(
      perministerRoleForProject(session, organizationId, "other-project"),
    ).toBeNull();
    expect(
      perministerRoleForProject(
        {
          ...session,
          organizations: [{ ...session.organizations[0], platformAdmin: true }],
        },
        organizationId,
        "other-project",
      ),
    ).toBe("admin");
  });
});
