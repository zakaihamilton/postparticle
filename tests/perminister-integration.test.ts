import { afterEach, describe, expect, it, vi } from "vitest";
import {
  perministerAuthorize,
  perministerLogin,
  perministerRoleForProject,
  perministerSession,
} from "@/lib/perminister-integration";

const organizationId = "550e8400-e29b-41d4-a716-446655440000";
const clientId = "550e8400-e29b-41d4-a716-446655440001";

function configure() {
  vi.stubEnv("PERMINISTER_BASE_URL", "https://perminister.example");
  vi.stubEnv("PERMINISTER_ORGANIZATION_ID", organizationId);
  vi.stubEnv("PERMINISTER_CLIENT_ID", clientId);
  vi.stubEnv("PERMINISTER_CLIENT_SECRET", "server-only-client-secret");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Perminister consumer integration", () => {
  it("sends credentials only to the server-side login endpoint", async () => {
    configure();
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          sessionToken: "remote-session-token",
          account: { subjectId: "subject-id" },
          session: { expiresAt: "2026-10-08T12:00:00.000Z" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      perministerLogin("writer", "secret-password"),
    ).resolves.toEqual({
      token: "remote-session-token",
      expiresAt: "2026-10-08T12:00:00.000Z",
    });
    const [url, init] = fetch.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(String(url)).toBe(
      "https://perminister.example/api/auth/consumer/login",
    );
    expect(headers.get("X-Perminister-Client-Id")).toBe(clientId);
    expect(headers.get("X-Perminister-Client-Secret")).toBe(
      "server-only-client-secret",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      identifier: "writer",
      password: "secret-password",
    });
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
