import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { tmpdir } from "node:os";
process.env.LOCAL_STORAGE_PATH = path.join(
  tmpdir(),
  `postparticle-test-e2e-${process.pid}`,
);
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/setup.ts",
  workers: 1,
  fullyParallel: false,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command: "npm run start -- --port 3100",
      url: "http://localhost:3100",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        STORAGE_DRIVER: "local",
        ALLOW_LOCAL_TEST_STORAGE: "true",
        LOCAL_STORAGE_PATH: process.env.LOCAL_STORAGE_PATH,
        APP_ORIGIN: "http://localhost:3100",
      },
    },
    {
      command: "npm run example:start -- --port 3101",
      url: "http://localhost:3101/robots.txt",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        POSTPARTICLE_URL: "http://localhost:3100",
        WEBSITE_URL: "http://localhost:3101",
        POSTPARTICLE_PROJECT: "demo",
      },
    },
  ],
});
