// The whole-factory views on the congested graph (scenes `sankey` and `heatmap`), in dark and light. After an
// intentional visual change: `pnpm e2e --update-snapshots=all`, look at every changed image, and commit them.
import { expect, test, type Page } from "@playwright/test";

async function openScene(page: Page, name: "sankey" | "heatmap", colorScheme: "dark" | "light") {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  await page.goto(`/?scene=${name}`);
  await expect(page.locator(`[data-scene="${name}"]`)).toBeAttached();
  await expect(page.locator(".react-flow__node").first()).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
}

for (const colorScheme of ["dark", "light"] as const) {
  test(`the Sankey overview of the congested graph in ${colorScheme}`, async ({ page }) => {
    await openScene(page, "sankey", colorScheme);
    await expect(page.getByRole("img", { name: "Flows of the factory" })).toBeVisible();
    await expect(page).toHaveScreenshot(`sankey-${colorScheme}.png`, { animations: "disabled" });
  });

  test(`the bottleneck heatmap of the congested graph in ${colorScheme}`, async ({ page }) => {
    await openScene(page, "heatmap", colorScheme);
    await expect(page.locator(".heatmap-layer circle").first()).toBeAttached();
    await expect(page).toHaveScreenshot(`heatmap-${colorScheme}.png`, { animations: "disabled" });
  });
}

test("S opens and Escape closes the Sankey overview; H toggles the heatmap", async ({ page }) => {
  await openScene(page, "heatmap", "dark");
  const sankey = page.getByRole("region", { name: "Sankey overview" });
  await expect(sankey).toBeHidden();
  await page.keyboard.press("s");
  await expect(sankey).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sankey).toBeHidden();

  await expect(page.locator(".heatmap-layer")).toBeAttached();
  await page.keyboard.press("h");
  await expect(page.locator(".heatmap-layer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hide the heatmap" })).toBeHidden();
});
