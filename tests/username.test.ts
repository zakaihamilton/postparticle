import { describe, expect, it } from "vitest";
import { usernameSchema } from "@/lib/username";
import { identifier } from "@/lib/config";

describe("account names", () => {
  it("preserves legacy usernames and canonicalizes email names", () => {
    expect(usernameSchema.parse("admin_1")).toBe("admin_1");
    expect(usernameSchema.parse(" Editor+News@Example.COM ")).toBe(
      "editor+news@example.com",
    );
  });

  it("rejects invalid emails and storage path separators", () => {
    for (const value of [
      "",
      "Bad user",
      "a@",
      "a/b@example.com",
      "a\\b@example.com",
      "../admin",
      "user@example.com/other",
    ])
      expect(usernameSchema.safeParse(value).success).toBe(false);
  });

  it("keeps email names out of project IDs and article slugs", () => {
    expect(identifier.safeParse("editor@example.com").success).toBe(false);
  });
});
