import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ value: "perminister-session" }),
  }),
}));

import { projectMemberAccounts } from "@/lib/auth";

const organizationId = "550e8400-e29b-41d4-a716-446655440000";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("project member status", () => {
  it("combines disabled account status with the separate project grant state", async () => {
    vi.stubEnv("PERMINISTER_BASE_URL", "https://perminister.example");
    vi.stubEnv("PERMINISTER_CLIENT_ID", "550e8400-e29b-41d4-a716-446655440001");
    vi.stubEnv("PERMINISTER_CLIENT_SECRET", "server-only-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const payload = url.includes("/members?")
          ? {
              members: [
                {
                  subjectId: "subject-disabled",
                  username: "suspended",
                  active: true,
                  role: "editor",
                },
                {
                  subjectId: "subject-inactive",
                  username: "former-editor",
                  active: false,
                  role: "editor",
                },
              ],
            }
          : {
              accounts: [
                {
                  subjectId: "subject-disabled",
                  username: "suspended",
                  status: "disabled",
                  platformAdmin: false,
                },
                {
                  subjectId: "subject-inactive",
                  username: "former-editor",
                  status: "active",
                  platformAdmin: false,
                },
              ],
            };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await expect(
      projectMemberAccounts(organizationId, "journal"),
    ).resolves.toEqual([
      {
        username: "suspended",
        disabled: true,
        accessActive: true,
        role: "editor",
      },
      {
        username: "former-editor",
        disabled: false,
        accessActive: false,
        role: "editor",
      },
    ]);
  });

  it("does not report a member as active when Perminister omits account status", async () => {
    vi.stubEnv("PERMINISTER_BASE_URL", "https://perminister.example");
    vi.stubEnv("PERMINISTER_CLIENT_ID", "550e8400-e29b-41d4-a716-446655440001");
    vi.stubEnv("PERMINISTER_CLIENT_SECRET", "server-only-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: RequestInfo | URL) =>
          new Response(
            JSON.stringify(
              String(input).includes("/members?")
                ? {
                    members: [
                      {
                        subjectId: "missing-account",
                        username: "missing",
                        active: true,
                        role: "viewer",
                      },
                    ],
                  }
                : { accounts: [] },
            ),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    await expect(
      projectMemberAccounts(organizationId, "journal"),
    ).rejects.toMatchObject({ status: 503 });
  });
});
