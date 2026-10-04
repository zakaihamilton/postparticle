import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("welcome animations finish, publishing is repeatable, and both themes remain accessible", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your content, connected.",
  );
  for (const selector of [
    "#product",
    "#the-workflow",
    "#media",
    "#connected",
    "#access",
  ]) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    await expect(page.locator(selector)).toHaveAttribute(
      "data-entered",
      "true",
    );
    await page.locator(selector).evaluate(async (el) => {
      await Promise.all(
        el
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished),
      );
    });
    expect(
      await page
        .locator(selector)
        .evaluate((el) =>
          el
            .getAnimations({ subtree: true })
            .some((animation) => animation.playState === "running"),
        ),
    ).toBe(false);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.scrollTo(0, 0));
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
    await page.screenshot({
      path: `test-results/welcome-hero-${info.project.name}-${theme.toLowerCase()}.png`,
    });
    await page.screenshot({
      path: `test-results/welcome-${info.project.name}-${theme.toLowerCase()}.png`,
      fullPage: true,
    });
  }
  const publish = page.getByRole("button", {
    name: "Publish preview",
    exact: true,
  });
  await publish.focus();
  await publish.press("Enter");
  await expect(page.getByRole("status")).toContainText("Published");
  await page
    .getByRole("button", { name: "Back to draft", exact: true })
    .press("Enter");
  await expect(page.getByRole("status")).toContainText("Draft");
  expect(
    await page.evaluate(() =>
      document
        .getAnimations()
        .some((animation) => animation.playState === "running"),
    ),
  ).toBe(false);
  await expect(page.getByRole("button", { name: /animations/i })).toHaveCount(
    0,
  );
  await page
    .getByRole("link", { name: "Explore the workflow", exact: true })
    .click();
  await expect(page).toHaveURL(/#the-workflow$/);
  await expect
    .poll(() =>
      page
        .locator("#the-workflow")
        .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
    )
    .toBe(25);
});

test("welcome content and navigation remain available without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 360, height: 800 },
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const id of ["the-workflow", "media", "connected", "access"]) {
      const heading = page.locator(`#${id} h2`).first();
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("link", { name: "Developer guides", exact: true })
      .click();
    await expect(page).toHaveURL(/\/developers$/);
  } finally {
    await context.close();
  }
});
