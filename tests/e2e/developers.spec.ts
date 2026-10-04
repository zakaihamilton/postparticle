import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public developer guides navigate without login, render on the server, and support themes", async ({
  page,
  request,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .getByRole("link", { name: "Developer guides", exact: true })
    .click();
  await expect(page).toHaveURL(/\/developers$/);
  const paths = [
    "/developers",
    "/developers/nextjs/setup",
    "/developers/nextjs/articles",
    "/developers/nextjs/article-page",
    "/developers/nextjs/seo",
  ];
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    expect(await response.text()).toContain("On this page");
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Developer topics" })
        .locator('[aria-current="page"]'),
    ).toHaveAttribute("href", path);
    for (const theme of ["Dark", "Light"]) {
      await page.getByRole("combobox", { name: "Color theme" }).click();
      await page.getByRole("option", { name: theme, exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        theme.toLowerCase(),
      );
      await expect
        .poll(async () => (await new AxeBuilder({ page }).analyze()).violations)
        .toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.goto("/developers/nextjs/setup");
  await page
    .getByRole("link", { name: "Typed fetch helper", exact: true })
    .click();
  await expect(page).toHaveURL(/#helper$/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/developers-${info.project.name}.png`,
    fullPage: false,
  });
  await page
    .getByRole("navigation", { name: "Guide pagination" })
    .getByRole("link", { name: /Next/ })
    .click();
  await expect(page).toHaveURL(/\/articles$/);
  await page
    .getByRole("navigation", { name: "Guide pagination" })
    .getByRole("link", { name: /Previous/ })
    .click();
  await expect(page).toHaveURL(/\/setup$/);
  await page.goto("/developers");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to guide" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#guide-content$/);
  expect((await request.get("/developers/nextjs/unknown")).status()).toBe(404);
  const guide = await request.get("/developers/resources/integration");
  expect(guide.status()).toBe(200);
  expect(await guide.text()).toContain("# Website integration");
  expect((await request.get("/developers/resources/unknown")).status()).toBe(
    404,
  );
});

test("code blocks copy exact text and recover from clipboard errors", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as unknown as { copiedText: string }).copiedText = value;
        },
      },
    });
  });
  await page.goto("/developers/nextjs/setup");
  const button = page.getByRole("button", {
    name: "Copy .env.local",
    exact: true,
  });
  await button.focus();
  await button.press("Enter");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: ".env.local copied to clipboard." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedText: string }).copiedText,
    ),
  ).toBe(
    await page.getByLabel(".env.local source", { exact: true }).textContent(),
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Clipboard blocked");
        },
      },
    }),
  );
  await button.click();
  await expect(button).toHaveText("Retry copy");
  await expect(
    page.getByText(
      "Clipboard unavailable. Select the code to copy manually, or retry.",
    ),
  ).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => {} },
    }),
  );
  await button.click();
  await expect(button).toHaveText("Copied");
});

test("workspace Settings & API links to the public guides", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": "2001:db8::deve" });
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("admin");
  await page
    .getByLabel("Password", { exact: true })
    .fill("fixture-password-123");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await page.goto("/workspace/demo/settings");
  await page
    .getByRole("link", { name: "Read the Next.js developer guides" })
    .click();
  await expect(page).toHaveURL(/\/developers$/);
});
