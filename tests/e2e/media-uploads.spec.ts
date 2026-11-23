import { expect, test } from "@playwright/test";
import { organizationScopedPath, signIn } from "./helpers";

async function openMediaLibrary(page: any) {
  await page.getByRole("link", { name: /Demo Journal/ }).click();
  if ((page.viewportSize()?.width ?? 1024) <= 768) {
    const openNavigation = page.locator("button.pf-mobile-menu-button");
    await openNavigation.waitFor({ state: "visible" });
    if ((await openNavigation.getAttribute("aria-expanded")) !== "true") {
      await openNavigation.click();
    }
  }
  await page
    .locator("#pf-dashboard-sidebar")
    .getByRole("link", { name: "Media library", exact: true })
    .click();
}

async function chooseFixtureImage(page: any, filename: string) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(`tests/fixtures/${filename}`);
}

test("media upload and metadata plus JSON publication work", async ({
  page,
}) => {
  await signIn(page);
  await openMediaLibrary(page);
  await chooseFixtureImage(page, "tiny.png");
  await expect(page.getByRole("status")).toContainText("Upload complete");
  await page
    .getByRole("link", { name: /tiny.png/ })
    .first()
    .click();
  await page
    .getByLabel("Alt text", { exact: true })
    .fill("A tiny fixture image");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status")).toContainText("Asset details saved");
  await page.route("**/api/manage/projects/demo/editor*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  const initialEditorData = page.waitForResponse(
    (response) =>
      response.url().includes("/api/manage/projects/demo/editor") &&
      response.url().includes("id=new"),
  );
  await page.goto("/workspace/demo/documents/new");
  const title = `Browser JSON ${Date.now()}`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("JSON content", { exact: true })
    .fill('{"headline":"Hello from JSON","enabled":true}');
  await initialEditorData;
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(title);
  await expect(page.getByLabel("JSON content", { exact: true })).toHaveValue(
    '{"headline":"Hello from JSON","enabled":true}',
  );
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page).toHaveURL(/documents\/browser-json-/);
  const key = new URL(page.url()).pathname.split("/").at(-1);
  const document = await page.request.get(
    organizationScopedPath(`/api/v1/projects/demo/documents/${key}`),
  );
  expect(document.status()).toBe(200);
  expect((await document.json()).value).toEqual({
    headline: "Hello from JSON",
    enabled: true,
  });
});
