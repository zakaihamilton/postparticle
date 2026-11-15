import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui-responsive",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3300",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm dev:preview",
    url: "http://127.0.0.1:3300/ui-preview",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
