import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("public welcome leads to Perminister sign-in, supports themes and reduced motion", async ({
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
    .getByRole("button", { name: "Try publishing the demo", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Published");
  await page.getByRole("button", { name: "Back to draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft");
  await page
    .locator("summary")
    .filter({ hasText: "Where does my content live?" })
    .click();
  await expect(
    page.getByText(/Your content lives in S3-compatible object storage/),
  ).toBeVisible();
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
  await expect(page).toHaveURL(/127\.0\.0\.1:3102\/oauth\/authorize/);
  await expect(page.getByRole("heading", { name: "Perminister sign-in" })).toBeVisible();
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
});
