// Screenshots and behaviour of the totals card (scene `totals`): a planned works with ferrite near the map's
// limit and cuprite over it. After an intentional visual change: `pnpm e2e --update-snapshots=all`, look at
// every changed image, and commit them with the change.
import { expect, test, type Page } from "@playwright/test";

async function openTotals(page: Page, colorScheme: "dark" | "light") {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  await page.goto("/?scene=totals");
  await expect(page.locator('[data-scene="totals"]')).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
  return page.getByRole("region", { name: "Totals" });
}

for (const colorScheme of ["dark", "light"] as const) {
  test(`the totals card in ${colorScheme}`, async ({ page }) => {
    await openTotals(page, colorScheme);
    await expect(page).toHaveScreenshot(`totals-${colorScheme}.png`, { animations: "disabled" });
  });
}

test("shows raw resources against the map's limits, power and buildings", async ({ page }) => {
  const totals = await openTotals(page, "dark");
  const raw = totals.getByRole("region", { name: "Raw resources" });
  // 460 of 500 ferrite a second, 320 of 300 cuprite (the scene shows rates per minute).
  await expect(raw.getByRole("listitem").filter({ hasText: "Ferrite Ore" })).toContainText("92% of 30,000/min");
  await expect(raw.getByRole("listitem").filter({ hasText: "Cuprite Ore" })).toContainText("107% of 18,000/min");
  await expect(raw.getByLabel("Over the map's limit")).toHaveCount(1);
  await expect(totals.getByRole("region", { name: "Buildings" })).toContainText("Furnace× 1,860");
  await expect(totals.getByRole("region", { name: "Outputs" })).toContainText("Iron Gear");
});

test("collapses to a pill with T and expands again", async ({ page }) => {
  const totals = await openTotals(page, "dark");
  await page.keyboard.press("t");
  await expect(totals).toBeHidden();
  const pill = page.getByRole("button", { name: "Totals" });
  await expect(pill).toContainText("machines");
  await expect(pill).toContainText("Cuprite Ore over the map");
  await expect(page).toHaveScreenshot("totals-collapsed-dark.png", { animations: "disabled" });
  await pill.click();
  await expect(totals).toBeVisible();
});
