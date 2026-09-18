import { defineConfig, devices } from "@playwright/test";

/**
 * Full-system E2E config (permanent workflow audit, section 85).
 *
 * This suite exercises the REAL app against the REAL demo Supabase project
 * (PIVOTROOM-DEMO) -- there is no mock backend. `webServer` boots `next dev`
 * itself so `npm run test:e2e` is a single command, but CI/local machines
 * must have NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
 * SUPABASE_SERVICE_ROLE_KEY (see .env.example and e2e/README.md) available
 * in the environment for both the app and the test fixtures to use.
 *
 * KNOWN LIMITATION (documented, not hidden -- see e2e/README.md
 * "Execution status"): the sandbox this suite was authored in cannot reach
 * the Supabase host at all (outbound HTTPS is policy-blocked at the proxy
 * layer, confirmed via curl + proxy status introspection), so `next dev`
 * cannot render a single page there and this suite could not be executed
 * in that session. It is written to run for real in CI or on a developer
 * machine with real network access.
 */
export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "tablet",
      use: { ...devices["iPad Mini"] },
      testMatch: /responsive\.spec\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"] },
      testMatch: /responsive\.spec\.ts/,
    },
  ],

  webServer: {
    command: "npm run dev",
    url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
