// Screenshots of the canonical scenes from docs/Design.md (Visual QA), in dark and light.
// Scenes are registered in src/client/scenes/registry.ts; placeholders show which task builds the real one.
// After an intentional visual change: `pnpm e2e --update-snapshots=all`, look at every changed image, and
// commit them with the change (docs/Development.md, Screenshot tests).
import { expect, test, type Page } from "@playwright/test";

const canonicalScenes = ["empty", "chain", "congested", "subgraph", "ghost-paste"];

async function openScene(page: Page, name: string, colorScheme: "dark" | "light") {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  await page.goto(`/?scene=${name}`);
  await expect(page.locator(`[data-scene="${name}"]`)).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
}

for (const name of canonicalScenes) {
  for (const colorScheme of ["dark", "light"] as const) {
    test(`scene ${name} in ${colorScheme}`, async ({ page }) => {
      await openScene(page, name, colorScheme);
      await expect(page).toHaveScreenshot(`${name}-${colorScheme}.png`, { animations: "disabled" });
    });
  }
}

test("an unknown scene lists the scenes there are", async ({ page }) => {
  await page.goto("/?scene=nope");
  await expect(page.getByText("There is no scene named “nope”.", { exact: false })).toBeVisible();
  for (const name of canonicalScenes) {
    await expect(page.getByRole("link", { name: new RegExp(`\\b${name}\\b`) })).toBeVisible();
  }
});
