import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { name: "320", width: 320, height: 900 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 900 },
  { name: "1024", width: 1024, height: 900 },
  { name: "1280", width: 1280, height: 900 },
] as const;
const themes = ["light", "dark"] as const;

async function preparePage(page: Page, width: number, height: number, theme: (typeof themes)[number]) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
}

async function choosePreviewScreen(page: Page, name: string) {
  const screenPicker = page
    .locator("details.ui-preview-dropdown")
    .filter({
      has: page.locator(".ui-preview-dropdown__label", { hasText: /^Screen$/ }),
    });
  await screenPicker.locator("summary").click();
  await screenPicker.getByRole("button", { name, exact: true }).click();
}

async function expectNoPageOverflow(page: Page, width: number) {
  const documentWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(documentWidth, `page overflowed at ${width}px`).toBeLessThanOrEqual(
    width,
  );
}

async function waitForStableFonts(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

test("welcome page keeps its theme control clear of Log in", async ({ page }) => {
  for (const theme of themes) {
    for (const viewport of viewports) {
      await preparePage(page, viewport.width, viewport.height, theme);
      await page.goto("/");
      await expect(page.getByRole("main").first()).toBeVisible();
      await waitForStableFonts(page);
      await expectNoPageOverflow(page, viewport.width);

      const layout = await page.evaluate(() => {
        const header = document.querySelector("header");
        const nav = header?.querySelector('nav[aria-label="Welcome navigation"]');
        const themeButton = nav?.querySelector(
          ".pf-theme-select .pf-select-trigger",
        );
        const login = nav?.querySelector('a[href="/login"]');
        const rect = (element: Element | null | undefined) => {
          if (!element) return null;
          const box = element.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
            centerY: box.top + box.height / 2,
          };
        };
        return {
          header: rect(header),
          theme: rect(themeButton),
          login: rect(login),
        };
      });

      expect(layout.theme, "theme control should be present").not.toBeNull();
      expect(layout.login, "Log in link should be present").not.toBeNull();
      const themeCoversLogin =
        layout.theme!.left < layout.login!.right &&
        layout.theme!.right > layout.login!.left &&
        layout.theme!.top < layout.login!.bottom &&
        layout.theme!.bottom > layout.login!.top;
      expect(themeCoversLogin).toBe(false);
      if (viewport.width >= 721) {
        expect(layout.theme!.right).toBeLessThanOrEqual(layout.login!.left);
        expect(
          Math.abs(layout.theme!.centerY - layout.login!.centerY),
        ).toBeLessThanOrEqual(2);
      }
      expect(layout.login!.right).toBeLessThanOrEqual(layout.header!.right - 8);

      await expect(page).toHaveScreenshot(
        `welcome-${viewport.name}-${theme}.png`,
        { animations: "disabled", caret: "hide" },
      );
    }
  }
});

test("account header stays in one row without control collisions", async ({
  page,
}) => {
  for (const theme of themes) {
    for (const viewport of viewports) {
      await preparePage(page, viewport.width, viewport.height, theme);
      await page.goto("/ui-preview");
      await choosePreviewScreen(page, "Choose a project");
      await expect(
        page.getByRole("heading", { name: /Good to see you/ }),
      ).toBeVisible();
      await waitForStableFonts(page);
      await expectNoPageOverflow(page, viewport.width);

      const layout = await page.evaluate(() => {
        const header = document.querySelector('[class*="topbar"]');
        const title = header?.children.item(0);
        const actions = header?.querySelector('[class*="accountHeaderActions"]');
        const organization = actions?.children.item(0)?.querySelector(
          ".pf-select-trigger",
        );
        const theme = actions?.querySelector(
          ".pf-theme-select .pf-select-trigger",
        );
        const logout = actions?.querySelector('button[aria-label="Log out"]');
        const rect = (element: Element | null | undefined) => {
          if (!element) return null;
          const box = element.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
            centerY: box.top + box.height / 2,
          };
        };
        return {
          header: rect(header),
          title: rect(title),
          actions: rect(actions),
          organization: rect(organization),
          theme: rect(theme),
          logout: rect(logout),
        };
      });

      expect(layout.header, "account header should be present").not.toBeNull();
      expect(layout.actions, "account controls should be present").not.toBeNull();
      expect(layout.theme, "theme control should be present").not.toBeNull();
      expect(layout.logout, "Log out button should be present").not.toBeNull();
      expect(
        Math.abs(layout.title!.centerY - layout.actions!.centerY),
        "account header title and controls should share a row",
      ).toBeLessThanOrEqual(2);
      if (layout.organization) {
        expect(layout.organization.right).toBeLessThanOrEqual(
          layout.theme!.left,
        );
      }
      expect(layout.theme!.right).toBeLessThanOrEqual(layout.logout!.left);
      expect(layout.title!.left).toBeGreaterThanOrEqual(
        layout.header!.left + 8,
      );
      expect(layout.logout!.right).toBeLessThanOrEqual(
        layout.header!.right - 8,
      );

      await expect(page).toHaveScreenshot(
        `account-${viewport.name}-${theme}.png`,
        { animations: "disabled", caret: "hide" },
      );
    }
  }
});

test("workspace preview preserves spacing without horizontal overflow", async ({
  page,
}) => {
  for (const theme of themes) {
    for (const viewport of viewports) {
      await preparePage(page, viewport.width, viewport.height, theme);
      await page.goto("/ui-preview");
      await expect(page.getByRole("heading", { name: /Hello, Alex Morgan/ })).toBeVisible();
      await waitForStableFonts(page);
      await expectNoPageOverflow(page, viewport.width);

      const layout = await page.evaluate(() => {
        const toolbar = document.querySelector('[class*="sharedToolbar"]');
        const location = toolbar?.querySelector('[class*="toolbarLocation"]');
        const actions = toolbar?.querySelector('[class*="accountHeaderActions"]');
        const organization = actions?.children.item(0);
        const theme = actions?.querySelector(
          ".pf-theme-select .pf-select-trigger",
        );
        const rect = (element: Element | null | undefined) => {
          if (!element) return null;
          const box = element.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
          };
        };
        return {
          toolbar: rect(toolbar),
          location: rect(location),
          actions: rect(actions),
          organization: rect(organization),
          theme: rect(theme),
        };
      });

      expect(layout.toolbar, "workspace toolbar should be present").not.toBeNull();
      expect(layout.location).not.toBeNull();
      expect(layout.actions).not.toBeNull();
      expect(layout.theme).not.toBeNull();
      if (layout.location!.bottom <= layout.actions!.top) {
        expect(layout.location!.bottom).toBeLessThanOrEqual(layout.actions!.top);
      } else if (layout.actions!.bottom <= layout.location!.top) {
        expect(layout.actions!.bottom).toBeLessThanOrEqual(layout.location!.top);
      }
      if (layout.organization) {
        expect(layout.organization.right).toBeLessThanOrEqual(
          layout.theme!.left,
        );
      }

      await expect(page).toHaveScreenshot(
        `workspace-${viewport.name}-${theme}.png`,
        { animations: "disabled", caret: "hide" },
      );
    }
  }
});
