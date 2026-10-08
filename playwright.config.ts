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
      command: "node --import tsx tests/e2e/perminister-stub.ts",
      url: "http://127.0.0.1:3102/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
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
        PERMINISTER_BASE_URL: "http://127.0.0.1:3102",
        PERMINISTER_ORGANIZATION_ID: "550e8400-e29b-41d4-a716-446655440000",
        PERMINISTER_CLIENT_ID: "550e8400-e29b-41d4-a716-446655440001",
        PERMINISTER_CLIENT_SECRET: "test-client-secret",
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
