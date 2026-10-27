// Reduced motion (CARB-66): with `prefers-reduced-motion: reduce`, every transition the app runs is instant.
// CSS animations and transitions are both in `document.getAnimations()`; the canvas's camera moves (d3, not CSS)
// are checked by the view: it's where it's going on the next frame.
import { expect, test, type Page } from "@playwright/test";
import { chain } from "../src/client/canvas/scenes/chain";
import { openInApp } from "./qol-helpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/** Animations and transitions still under way that take any time at all. */
function moving(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => {
        const { duration, activeDuration } = animation.effect?.getComputedTiming() ?? {};
        return animation.playState === "running" && (Number(duration) > 0 || Number(activeDuration) > 0);
      })
      .map((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        const name = "animationName" in animation ? String(animation.animationName) : "";
        const property = "transitionProperty" in animation ? String(animation.transitionProperty) : "";
        return `${name || property} on ${target instanceof Element ? target.className.toString().slice(0, 60) : "?"}`;
      }),
  );
}

function viewport(page: Page): Promise<string> {
  return page.locator(".react-flow__viewport").evaluate((element) => getComputedStyle(element).transform);
}

/** The view a camera move ends at is reached on the next frame. */
async function expectInstantCamera(page: Page, key: string) {
  await page.keyboard.press(key);
  const next = await page.evaluate(
    () =>
      new Promise<string>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            resolve(getComputedStyle(document.querySelector(".react-flow__viewport") as Element).transform),
          ),
        ),
      ),
  );
  await page.waitForTimeout(600);
  expect(await viewport(page)).toBe(next);
}

test("with reduced motion, overlays, the canvas, ghosts and subgraphs move instantly", async ({ page }) => {
  await openInApp(page, chain);
  await expect.poll(() => moving(page)).toEqual([]);

  // Camera moves: zoom to the selection, then to the whole factory. Close up, flows carry no particles.
  await page.locator('.react-flow__node[data-id="wire"]').focus();
  await page.keyboard.press("Enter");
  await expectInstantCamera(page, "Shift+F");
  await expect(page.locator(".react-flow").first()).not.toHaveClass(/particles-off/);
  await expect(page.locator(".flow-particles").first()).toBeHidden();
  await expectInstantCamera(page, "f");

  // Overlays appear at once: the palette, the planner card, the totals, the Sankey overview, the cheat sheet.
  for (const [key, shown, close] of [
    ["ControlOrMeta+K", page.getByRole("dialog", { name: "Command palette" }), "Escape"],
    ["p", page.getByRole("region", { name: "Plan production" }), "Escape"],
    ["t", page.getByRole("region", { name: "Totals" }), "t"],
    ["s", page.getByRole("region", { name: "Sankey overview" }), "Escape"],
    ["?", page.getByRole("dialog", { name: "Keyboard shortcuts" }), "Escape"],
  ] as const) {
    await page.keyboard.press(key);
    await expect(shown).toBeVisible();
    expect(await moving(page), `after ${key}`).toEqual([]);
    // The planner's item field takes the first Escape (it closes its list).
    for (let presses = 0; presses < 2 && (await shown.isVisible()); presses++) await page.keyboard.press(close);
    await expect(shown).toBeHidden();
  }

  // A paste's ghost doesn't breathe while it waits.
  await page.locator('.react-flow__node[data-id="wire"]').focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+C");
  await page.keyboard.press("ControlOrMeta+V");
  await expect(page.locator(".react-flow__node.ghost-frame")).toBeVisible();
  expect(await moving(page)).toEqual([]);
  await page.keyboard.press("Escape");

  // Into a subgraph and out again, without the zoom and the canvas growing in.
  await page.keyboard.press("ControlOrMeta+G");
  await expect(page.locator(".react-flow__node-instance")).toHaveClass(/selected/);
  await page.keyboard.press("ControlOrMeta+ArrowDown");
  await expect(page.getByRole("navigation", { name: "Subgraph" })).toBeVisible();
  expect(await moving(page)).toEqual([]);
  await page.keyboard.press("ControlOrMeta+ArrowUp");
  await expect(page.getByRole("navigation", { name: "Subgraph" })).toBeHidden();
  expect(await moving(page)).toEqual([]);
});

test("without reduced motion the flows do move, so the check above can fail", async ({ page }) => {
  await openInApp(page, chain);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator('.react-flow__node[data-id="wire"]').focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+F");
  await expect(page.locator(".flow-particles").first()).toBeVisible();
  await expect.poll(async () => (await moving(page)).length).toBeGreaterThan(0);
});
