import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";

// Each browser workflow has its own fixture client so login throttling stays isolated.
test.beforeEach(async ({ page }, info) => {
  const client = createHash("sha256")
    .update(info.testId)
    .digest("hex")
    .slice(0, 4);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `2001:db8::${client}` });
});
async function signIn(page: Page, username = "admin") {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill("fixture-password-123");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
}
test("public welcome leads to a separate login page, supports themes and reduced motion", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Manage your website’s content.",
  );
  await page.getByRole("combobox", { name: "Color theme" }).click();
  await page.getByRole("option", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("combobox", { name: "Color theme" }).click();
  await page.getByRole("option", { name: "Light", exact: true }).click();
  await page
    .getByRole("button", { name: "Publish preview", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Published");
  await page.getByRole("button", { name: "Back to draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft");
  await page
    .locator("summary")
    .filter({ hasText: "Where does my content live?" })
    .click();
  await expect(page.getByText(/In your DigitalOcean Spaces/)).toBeVisible();
  await expect
    .poll(async () => (await new AxeBuilder({ page }).analyze()).violations)
    .toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/welcome-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
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
    `/api/v1/projects/demo/articles/browser-story-${info.project.name}`,
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
          `/api/v1/projects/demo/articles/browser-story-${info.project.name}`,
        )
      ).json()
    ).title,
  ).toBe(title);
  await page.getByRole("button", { name: /Show .* revisions/ }).click();
  await expect(
    page.getByRole("button", { name: "Restore draft" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Content updated");
  expect(
    (
      await page.request.get(
        `/api/v1/projects/demo/articles/browser-story-${info.project.name}`,
      )
    ).status(),
  ).toBe(404);
});
test("users see authorized projects only and viewers cannot sign uploads", async ({
  page,
}) => {
  await signIn(page, "outsider");
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
test("media upload and metadata plus JSON publication work", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/workspace/demo/media");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload media", exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "tiny.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVf8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByRole("status")).toContainText("Upload complete");
  await page
    .getByRole("button", { name: /tiny.png/ })
    .first()
    .click();
  await page
    .getByLabel("Alt text", { exact: true })
    .fill("A tiny fixture image");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status")).toContainText("Asset details saved");
  await page.goto("/workspace/demo/documents/new");
  const title = `Browser JSON ${Date.now()}`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("JSON content", { exact: true })
    .fill('{"headline":"Hello from JSON","enabled":true}');
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page).toHaveURL(/documents\/browser-json-/);
  const key = new URL(page.url()).pathname.split("/").at(-1);
  const document = await page.request.get(
    `/api/v1/projects/demo/documents/${key}`,
  );
  expect(document.status()).toBe(200);
  expect((await document.json()).value).toEqual({
    headline: "Hello from JSON",
    enabled: true,
  });
});
test("generic blog renders content and SEO in initial HTML", async ({
  request,
}) => {
  const response = await request.get(
    "http://localhost:3101/blog/a-little-room",
  );
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("A fresh perspective");
  expect(html).toContain('rel="canonical"');
  expect(html).toContain('property="og:title"');
  expect(html).toContain("application/ld+json");
  const sitemap = await request.get("http://localhost:3101/sitemap.xml");
  expect(await sitemap.text()).toContain("/blog/a-little-room");
});

test("custom dropdown supports keyboard selection, dismissal and a rotating inset arrow", async ({
  page,
}) => {
  await page.goto("/");
  const control = page.getByRole("combobox", { name: "Color theme" });
  await control.focus();
  await control.press("ArrowDown");
  await expect(control).toHaveAttribute("aria-expanded", "true");
  await expect
    .poll(() =>
      page
        .getByRole("heading", { level: 1 })
        .evaluate((el) => getComputedStyle(el.parentElement!).opacity),
    )
    .toBe("1");
  const arrow = control.locator("svg[data-open]");
  await expect(arrow).toHaveAttribute("data-open", "true");
  await expect
    .poll(() => arrow.evaluate((el) => getComputedStyle(el).transform))
    .toBe("matrix(-1, 0, 0, -1, 0, 0)");
  await expect
    .poll(async () => (await new AxeBuilder({ page }).analyze()).violations)
    .toEqual([]);
  expect(
    await control.evaluate((el) => {
      const svg = el.querySelector("svg[data-open]")!;
      return (
        el.getBoundingClientRect().right - svg.getBoundingClientRect().right
      );
    }),
  ).toBeGreaterThanOrEqual(12);
  await control.press("End");
  await control.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(control).toBeFocused();
  await expect(control).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(() => arrow.evaluate((el) => getComputedStyle(el).transform))
    .toBe("matrix(1, 0, 0, 1, 0, 0)");
  await control.press("Enter");
  await control.press("Escape");
  await expect(control).toHaveAttribute("aria-expanded", "false");
  await control.click();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(control).toHaveAttribute("aria-expanded", "false");
  await control.focus();
  await control.press("Enter");
  await control.press("Tab");
  await expect(control).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: /animations/i })).toHaveCount(
    0,
  );
});

test("workspace dropdowns work inside panels and preserve viewer permissions", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/workspace/demo/articles");
  await page.getByRole("combobox", { name: "Content status" }).click();
  await page.getByRole("option", { name: "Published", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Content status" }),
  ).toHaveText("Published");
  await page.getByRole("combobox", { name: "Date order" }).click();
  await page.getByRole("option", { name: "Oldest first" }).click();
  await expect(page.getByRole("combobox", { name: "Date order" })).toHaveText(
    "Oldest first",
  );
  await page.goto("/workspace/demo/articles/new");
  const cover = page.getByRole("combobox", { name: "Cover image" });
  await cover.click();
  await expect(
    page.getByRole("option", { name: "No cover image" }),
  ).toBeVisible();
  await page.getByRole("option", { name: "No cover image" }).click();
  const social = page.getByRole("combobox", { name: "Social image" });
  await social.click();
  await page.getByRole("option", { name: "Use cover image" }).click();
  await page.goto("/workspace/demo/members");
  const role = page.getByRole("combobox", {
    name: "Role for viewer",
    exact: true,
  });
  await role.click();
  await page.getByRole("option", { name: "Viewer", exact: true }).click();
  await expect(role).toBeEnabled();
  const navigation = page.getByRole("button", {
    name: "Toggle workspace navigation",
  });
  if (await navigation.isVisible()) await navigation.click();
  await page.getByRole("button", { name: "Log out" }).click();
  await signIn(page, "viewer");
  await page.goto("/workspace/demo/articles/a-little-room");
  await expect(
    page.getByRole("combobox", { name: "Cover image" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("combobox", { name: "Social image" }),
  ).toBeDisabled();
});

test("malformed media literals and arbitrary JSON fields publish through the public API", async ({
  page,
}, info) => {
  await signIn(page);
  const headers = { Origin: "http://localhost:3100" };
  const slug = `media-literals-${info.project.name}`;
  const body = `Literal media:${"a".repeat(36)} and media:550e8400-e29b-41d4-a716-446655440000extra`;
  const article = {
    slug,
    title: "Literal references",
    body,
    author: "Demo",
    excerpt: "",
    tags: ["regression"],
    articleDate: "2026-10-04",
    coverMediaId: "",
    socialMediaId: "",
    seoTitle: "",
    seoDescription: "",
  };
  expect(
    (
      await page.request.post("/api/manage/projects/demo/articles", {
        headers,
        data: article,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(`/api/manage/projects/demo/articles/${slug}`, {
        headers,
        data: { action: "publish" },
      })
    ).status(),
  ).toBe(200);
  const listing = await page.request.get(
    "/api/v1/projects/demo/articles?tag=regression",
  );
  expect(listing.status()).toBe(200);
  expect(
    (await listing.json()).items.find(
      (item: { slug: string }) => item.slug === slug,
    ).body,
  ).toBe(body);
  const detail = await page.request.get(
    `/api/v1/projects/demo/articles/${slug}`,
  );
  expect(detail.status()).toBe(200);
  expect((await detail.json()).body).toBe(body);
  const key = `arbitrary-json-${info.project.name}`;
  const value = {
    coverMediaId: "hero-image",
    nested: {
      socialMediaId: "550e8400-e29b-41d4-a716-446655440000",
      slug: "text",
      body,
    },
  };
  expect(
    (
      await page.request.post("/api/manage/projects/demo/documents", {
        headers,
        data: { key, title: "Arbitrary JSON", tags: [], value },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(`/api/manage/projects/demo/documents/${key}`, {
        headers,
        data: { action: "publish" },
      })
    ).status(),
  ).toBe(200);
  const document = await page.request.get(
    `/api/v1/projects/demo/documents/${key}`,
  );
  expect(document.status()).toBe(200);
  expect((await document.json()).value).toEqual(value);
});

test("unsaved editor changes block internal links until explicitly discarded", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/workspace/demo/articles/a-little-room");
  const title = page.getByLabel("Title", { exact: true });
  const original = await title.inputValue();
  await title.fill("Unsaved navigation draft");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("link", { name: "All articles", exact: true }).click();
  await expect(page).toHaveURL(/articles\/a-little-room$/);
  await expect(title).toHaveValue("Unsaved navigation draft");
  const menu = page.getByRole("button", {
    name: "Toggle workspace navigation",
  });
  if (await menu.isVisible()) await menu.click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("link", { name: "Articles", exact: true })
    .click();
  await expect(page).toHaveURL(/articles\/a-little-room$/);
  await expect(title).toHaveValue("Unsaved navigation draft");
  if (
    (await menu.isVisible()) &&
    (await menu.getAttribute("aria-expanded")) === "true"
  )
    await menu.click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("link", { name: "All articles", exact: true }).click();
  await expect(page).toHaveURL(/\/articles$/);
  await page.goto("/workspace/demo/articles/a-little-room");
  await expect(title).toHaveValue(original);
});

test("saving freezes editor fields and failed saves retain the unsaved draft", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/workspace/demo/articles/a-little-room");
  let release!: () => void;
  let received!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const committed = new Promise<void>((resolve) => {
    received = resolve;
  });
  const endpoint = "**/api/manage/projects/demo/articles/a-little-room";
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    const response = await route.fetch();
    received();
    await held;
    await route.fulfill({ response });
  });
  const title = page.getByLabel("Title", { exact: true });
  await title.fill("Frozen save snapshot");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await committed;
  await expect(title).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("Article body")).toHaveAttribute("readonly", "");
  await expect(
    page.getByRole("combobox", { name: "Cover image" }),
  ).toBeDisabled();
  await title.pressSequentially("Should not be saved");
  await expect(title).toHaveValue("Frozen save snapshot");
  release();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await expect(title).not.toHaveAttribute("readonly", "");
  const saved = await (
    await page.request.get("/api/manage/projects/demo/articles/a-little-room")
  ).json();
  expect(saved.draft.title).toBe("Frozen save snapshot");
  await page.unroute(endpoint);
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Fixture storage outage" }),
    });
  });
  await title.fill("Retained after failure");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Fixture storage outage" }),
  ).toBeVisible();
  await expect(title).toHaveValue("Retained after failure");
  await expect(title).not.toHaveAttribute("readonly", "");
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
});

async function chooseFixtureImage(page: Page, name: string) {
  const choosing = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload media", exact: true }).click();
  await (
    await choosing
  ).setFiles({
    name,
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVf8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
}
test("upload finalization can retry a lost success response without duplicating the asset", async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto("/workspace/demo/media");
  let first = true;
  let aborts = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/abort")) aborts++;
  });
  await page.route("**/media/*/complete", async (route) => {
    if (!first) return route.continue();
    first = false;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Fixture lost completion response" }),
    });
  });
  const filename = `retry-${info.project.name}.png`;
  await chooseFixtureImage(page, filename);
  await expect(
    page.getByRole("button", { name: "Retry finalization" }),
  ).toBeVisible();
  expect(aborts).toBe(0);
  await expect(
    page.getByRole("button", { name: "Upload media", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry finalization" }).click();
  await expect(page.getByRole("status")).toContainText("Upload complete");
  await expect(
    page.getByRole("button", { name: "Retry finalization" }),
  ).toHaveCount(0);
  const items = await (
    await page.request.get("/api/manage/projects/demo/media")
  ).json();
  expect(
    items.filter((item: { filename: string }) => item.filename === filename),
  ).toHaveLength(1);
});
test("a failed finalization can be explicitly discarded", async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto("/workspace/demo/media");
  let uploadId = "";
  await page.route("**/media/*/complete", async (route) => {
    uploadId = route.request().url().split("/").at(-2)!;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Fixture unavailable" }),
    });
  });
  await chooseFixtureImage(page, `discard-${info.project.name}.png`);
  await expect(
    page.getByRole("button", { name: "Discard upload" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Discard upload" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Upload cleanup complete",
  );
  await expect(
    page.getByRole("button", { name: "Upload media", exact: true }),
  ).toBeEnabled();
  expect(
    (
      await page.request.get(`/api/manage/projects/demo/media/${uploadId}`)
    ).status(),
  ).toBe(404);
});
