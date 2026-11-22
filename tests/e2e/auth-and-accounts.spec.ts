import { expect, test } from "@playwright/test";
import { organizationScopedPath, signIn } from "./helpers";

test("email usernames support account creation, resets, membership, and sign-in", async ({
  page,
}, info) => {
  await signIn(page);
  const email = `Editorial-${info.project.name}+News@Example.COM`;
  const canonical = email.toLowerCase();
  await page.goto("/account/platform-accounts/create");
  await expect(page.getByLabel("New username", { exact: true })).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  await page.getByLabel("New username", { exact: true }).fill(email);
  await page
    .getByLabel("Initial password", { exact: true })
    .fill("initial-test-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText("Account created. Assign project access from Users.", {
      exact: true,
    }),
  ).toBeVisible();
  const headers = { Origin: new URL(page.url()).origin };
  const duplicate = await page.request.post("/api/manage/users", {
    headers,
    data: { username: email, password: "initial-test-password" },
  });
  expect(duplicate.status()).toBe(409);

  await page.goto("/account/platform-accounts");
  await expect(page.getByLabel("New username", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  const account = page.locator("article").filter({ hasText: canonical });
  await expect(account).toBeVisible();
  await expect(page.getByText("Admin access to every project")).toBeVisible();
  await account.getByRole("button", { name: "Manage project access" }).click();
  const demoRole = page.getByRole("combobox", {
    name: "Project role for " + canonical + " in Demo Journal",
  });
  await demoRole.click();
  await page.getByRole("option", { name: "Editor", exact: true }).click();
  await expect(demoRole).toHaveText("Editor");
  const sentryRole = page.getByRole("combobox", {
    name: "Project role for " + canonical + " in SENTRY8",
  });
  await sentryRole.click();
  await page.getByRole("option", { name: "Viewer", exact: true }).click();
  await expect(sentryRole).toHaveText("Viewer");

  const assigned = await page.request.get(
    "/api/manage/users/" + encodeURIComponent(canonical) + "/projects",
  );
  expect(assigned.ok()).toBe(true);
  expect(await assigned.json()).toMatchObject({
    projects: [
      { id: "demo", role: "editor" },
      { id: "sentry8", role: "viewer" },
    ],
  });
  const globalAdminAccess = await page.request.get(
    "/api/manage/users/admin/projects",
  );
  expect((await globalAdminAccess.json()).projects).toEqual([
    expect.objectContaining({ id: "demo", role: "admin" }),
    expect.objectContaining({ id: "sentry8", role: "admin" }),
  ]);
  const changeGlobalAdminAccess = await page.request.post(
    "/api/manage/users/admin/projects",
    {
      headers,
      data: { projectId: "demo", role: "viewer" },
    },
  );
  expect(changeGlobalAdminAccess.status()).toBe(400);
  const invalidRole = await page.request.post(
    "/api/manage/users/" + encodeURIComponent(canonical) + "/projects",
    {
      headers,
      data: { projectId: "demo", role: "owner" },
    },
  );
  expect(invalidRole.status()).toBe(400);
  const unknownProject = await page.request.post(
    "/api/manage/users/" + encodeURIComponent(canonical) + "/projects",
    {
      headers,
      data: { projectId: "unknown", role: "viewer" },
    },
  );
  expect(unknownProject.status()).toBe(404);
  const globalAdminRow = page
    .locator("article")
    .filter({ hasText: "Admin access to every project" });
  await expect(
    globalAdminRow.getByRole("button", { name: "Manage project access" }),
  ).toHaveCount(0);

  await page.goto("/workspace/demo/members");
  const memberRole = page.getByRole("combobox", {
    name: "Role for " + canonical,
  });
  await expect(memberRole).toHaveText("Editor");
  await memberRole.click();
  await page.getByRole("option", { name: "Viewer", exact: true }).click();
  await expect(memberRole).toHaveText("Viewer");
  const synchronized = await page.request.get(
    "/api/manage/users/" + encodeURIComponent(canonical) + "/projects",
  );
  expect((await synchronized.json()).projects).toEqual([
    expect.objectContaining({ id: "demo", role: "viewer" }),
    expect.objectContaining({ id: "sentry8", role: "viewer" }),
  ]);

  await page.goto("/account/platform-accounts");
  await account.getByRole("button", { name: "Manage project access" }).click();
  await sentryRole.click();
  await page.getByRole("option", { name: "No access", exact: true }).click();
  await expect(sentryRole).toHaveText("No access");
  await account
    .getByRole("link", { name: "Reset password", exact: true })
    .click();
  await expect(page).toHaveURL(
    /\/account\/platform-accounts\/reset-password\?username=/,
  );
  await expect(
    page.getByRole("heading", { name: "Reset an account password" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Initial password", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Account to reset" }),
  ).toHaveText(canonical);
  await page
    .getByLabel("New password", { exact: true })
    .fill("fixture-password-123");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(
    page.getByText("Password reset. All previous sessions were revoked.", {
      exact: true,
    }),
  ).toBeVisible();
  const revoked = await page.request.post(
    `/api/manage/users/${encodeURIComponent(email)}/revoke`,
    { headers },
  );
  expect(revoked.ok()).toBe(true);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await signIn(page, email);
  await expect(page.getByRole("link", { name: /Demo Journal/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /SENTRY8/ })).toHaveCount(0);
});

test("users see authorized projects only and viewers cannot sign uploads", async ({
  page,
}) => {
  await signIn(page, "outsider");
  expect(
    (await page.request.get("/api/manage/users/admin/projects")).status(),
  ).toBe(403);
  await expect(
    page.getByRole("heading", { name: "No projects yet" }),
  ).toBeVisible();
  expect(
    (await page.request.get("/api/manage/projects/demo/articles")).status(),
  ).toBe(403);
  await page.getByRole("button", { name: "Log out" }).click();
  await signIn(page, "viewer");
  const request = await page.request.post("/api/manage/projects/demo/media", {
    headers: { Origin: "http://localhost:3100" },
    data: { filename: "image.png", contentType: "image/png", size: 3 },
  });
  expect(request.status()).toBe(403);
  const csrf = await page.request.post("/api/manage/projects/demo/articles", {
    headers: { Origin: "https://untrusted.example" },
    data: {},
  });
  expect(csrf.status()).toBe(403);
});
