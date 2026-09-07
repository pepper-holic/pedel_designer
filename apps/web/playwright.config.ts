import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against a real browser, which is the only place the parts jsdom cannot reach actually
 * happen: canvas rendering, wheel zoom, real layout, and the whole load-wire-simulate loop.
 *
 * The unit and component suites stay in Vitest; these are deliberately few and cover the critical
 * flows only, because a browser test costs seconds where a jsdom one costs milliseconds.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://localhost:4173",
    // Kept only for failures: passing runs would otherwise pile up artefacts nobody reads.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Tests the production build rather than the dev server, so what CI checks is what ships -
  // including the service worker and the bundled worker chunk.
  webServer: {
    command: "npm run build && npm run preview -- --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
