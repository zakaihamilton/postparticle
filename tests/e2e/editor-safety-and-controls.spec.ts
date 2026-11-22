import { expect, test } from "@playwright/test";
import { organizationScopedPath, signIn } from "./helpers";

test("login, project selection, article editing, publishing, tags, history, and unpublishing", async ({
  page,
}, info) => {
  await signIn(page);
  await page.getByRole("link", { name: /Demo Journal/ }).click();
  await expect(
    page.getByRole("heading", { name: /Hello, admin/ }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/workspace-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "New article", exact: true }).click();
  const title = `Browser story ${info.project.name}`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Author", { exact: true }).fill("Demo Author");
  await page.getByLabel("Tags", { exact: true }).fill("Browser, test");
  await page
    .getByLabel("Article body")
    .fill("## Browser content\n\nThis is rendered on a website.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`articles/browser-story-${info.project.name}$`),
  );
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Published");
  const published = await page.request.get(
    organizationScopedPath(
      `/api/v1/projects/demo/articles/browser-story-${info.project.name}`,
    ),
  );
  expect(published.status()).toBe(200);
  expect((await published.json()).tags).toEqual(["browser", "test"]);
  await page.getByLabel("Title", { exact: true }).fill("Private draft edit");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  expect(
    (
      await (
        await page.request.get(
          organizationScopedPath(
            `/api/v1/projects/demo/articles/browser-story-${info.project.name}`,
          ),
        )
      ).json()
    ).title,
  ).toBe(title);
  await page.getByRole("button", { name: "Show revision history" }).click();
  await expect(
    page.getByRole("button", { name: "Restore draft" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Content updated");
  expect(
    (
      await page.request.get(
        organizationScopedPath(
          `/api/v1/projects/demo/articles/browser-story-${info.project.name}`,
        ),
      )
    ).status(),
  ).toBe(404);
});
