import { defineConfig, devices } from "@playwright/test";

/** Parallel worktrees each pick their own port: `E2E_PORT=5174 pnpm e2e`. */
const port = Number(process.env.E2E_PORT ?? 5173);
const url = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "e2e",
  snapshotPathTemplate: "e2e/__screenshots__/{testFilePath}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: { baseURL: url, trace: "retain-on-failure" },
  // A low per-pixel threshold: the dark theme is low-contrast, and the default (0.2) misses whole panels in it.
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.05 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    // Vite directly, not through pnpm: the e2e runs inside the Playwright image, which has no pnpm (scripts/e2e.mjs).
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url,
    reuseExistingServer: !process.env.CI,
  },
});
