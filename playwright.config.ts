import { defineConfig, devices } from "@playwright/test";

const PORT = 8711;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "tests/e2e/report" }]],
  outputDir: "tests/e2e/results",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1600, height: 1000 },
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } } }],
  webServer: {
    command: "npm run build && npx tsx server/index.ts",
    url: `http://localhost:${PORT}/api/health`,
    env: { PORT: String(PORT), SEED_DEMO: "1", DATABASE_URL: "", SESSION_SECRET: "e2e-secret" },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
