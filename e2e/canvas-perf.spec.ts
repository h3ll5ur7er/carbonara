// Panning the 1,000-node perf scene at each level of detail (docs/Design.md, Performance). The stats are
// attached as annotations and printed; the budget is on the main thread's CPU time per frame, which stays
// meaningful on a busy CI machine. These run against the dev server (development React, StrictMode), which
// costs about twice the production build; the production numbers are on the Design page.
import { expect, test } from "@playwright/test";
import { measurePan } from "./canvas-perf";

const cases = [
  // A frame is 16.7 ms at 60 fps.
  { name: "full cards", zoom: 1, budget: 16.7 },
  { name: "compact cards", zoom: 0.4, budget: 16.7 },
  // All 1,000 chips on screen: development React needs about 15–17 ms here, production about 12.
  { name: "chips with the whole graph on screen", zoom: 0.08, budget: 25 },
];

// Three runs of 180 frames take long on a loaded machine.
test.describe.configure({ mode: "serial", timeout: 120_000 });

for (const { name, zoom, budget } of cases) {
  test(`panning 1,000 nodes stays within its frame budget at ${name}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(`/?scene=perf&zoom=${zoom}&focus=wire-95`);
    await expect(page.locator(".react-flow__node").first()).toBeAttached({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);

    // Best of three: on a shared machine the fastest run is the closest to what the code itself costs.
    const runs = [await measurePan(page), await measurePan(page), await measurePan(page)];
    const stats = runs.reduce((best, run) => (run.cpuPerFrame < best.cpuPerFrame ? run : best));
    const report = `${name} @ zoom ${zoom}: ${JSON.stringify(stats)}`;
    test.info().annotations.push({ type: "perf", description: report });
    console.log(`[perf] ${report}`);

    expect(stats.pannedPixels).toBeGreaterThan(100);
    expect(stats.cpuPerFrame).toBeLessThan(budget);
  });
}
