import { expect, type Page } from "@playwright/test";
import { testOrganizationId } from "./organization";

export function organizationScopedPath(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}organizationId=${testOrganizationId}`;
}

export async function signIn(page: Page, username = "admin") {
  await page.goto("/login");
  await expect(page).toHaveURL(/127\.0\.0\.1:3102\/oauth\/authorize/);
  await page
    .getByLabel("Username or email address", { exact: true })
    .fill(username);
  await page.getByLabel("Password", { exact: true }).fill("fixture-password-123");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
}

function workspaceNavigationToggle(page: Page) {
  return page.locator("button.pf-mobile-menu-button");
}
