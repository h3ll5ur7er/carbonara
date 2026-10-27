// Panning the 1,000-node and 50,000-node perf scenes at each level of detail (docs/Design.md, Performance). The
// stats are attached as annotations and printed; the budget is on the main thread's CPU time per frame, which
// stays meaningful on a busy CI machine. These run against the dev server (development React, StrictMode), which
// costs about twice the production build; the production numbers are on the Design page.
import { expect, test } from "@playwright/test";
import { measurePan } from "./canvas-perf";

const cases = [
  // A frame is 16.7 ms at 60 fps.
  { scene: "perf", nodes: "1,000", name: "full cards", zoom: 1, budget: 16.7, focus: "wire-95" },
  { scene: "perf", nodes: "1,000", name: "compact cards", zoom: 0.4, budget: 16.7, focus: "wire-95" },
  // All 1,000 chips on screen: development React needs about 15–17 ms here, production about 12.
  {
    scene: "perf",
    nodes: "1,000",
    name: "chips with the whole graph on screen",
    zoom: 0.08,
    budget: 25,
    focus: "wire-95",
  },
  { scene: "perf-50k", nodes: "50,000", name: "full cards", zoom: 1, budget: 16.7, focus: "wire-5050" },
  { scene: "perf-50k", nodes: "50,000", name: "compact cards", zoom: 0.4, budget: 16.7, focus: "wire-5050" },
  // No chips at 50,000 nodes: thousands of them on screen are thousands of DOM nodes (docs/Design.md).
];

// Three runs of 180 frames take long on a loaded machine, and 50,000 nodes take a while to load.
test.describe.configure({ mode: "serial", timeout: 300_000 });

for (const { scene, nodes, name, zoom, budget, focus } of cases) {
  test(`panning ${nodes} nodes stays within its frame budget at ${name}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(`/?scene=${scene}&zoom=${zoom}&focus=${focus}`);
    await expect(page.locator(".react-flow__node").first()).toBeAttached({ timeout: 120_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);

    // Best of three: on a shared machine the fastest run is the closest to what the code itself costs.
    const runs = [await measurePan(page), await measurePan(page), await measurePan(page)];
    const stats = runs.reduce((best, run) => (run.cpuPerFrame < best.cpuPerFrame ? run : best));
    const report = `${nodes} nodes, ${name} @ zoom ${zoom}: ${JSON.stringify(stats)}`;
    test.info().annotations.push({ type: "perf", description: report });
    console.log(`[perf] ${report}`);

    expect(stats.pannedPixels).toBeGreaterThan(100);
    expect(stats.cpuPerFrame).toBeLessThan(budget);
  });
}
