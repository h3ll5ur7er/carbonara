// Rates in belts, machines rounded to buildable, and balancing a machine's count (docs/Design/Editor-quality-of-life.md,
// Balance and units).
import { expect, test, type Page } from "@playwright/test";
import { congested } from "../src/client/canvas/scenes/congested";
import { openInApp } from "./qol-helpers";

async function openScene(page: Page, query: string) {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(`/?scene=${query}`);
  await expect(page.locator(".react-flow__node").first()).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
}

test("rates can be shown in belts, and machine counts evenly clocked", async ({ page }) => {
  await openScene(page, "congested&zoom=1&focus=gears");
  const gears = page.locator('[data-id="gears"]');
  await expect(gears).toContainText("22/s");

  await page.getByRole("combobox", { name: "Show rates in" }).click();
  await page.getByRole("option", { name: "× Conveyor" }).click();
  // 22 plates a second on 15-a-second conveyors.
  await expect(gears).toContainText("1.47 × Conveyor");
  // A sink's rate in belts gets a line of its own, so neither it nor the item's name is cut short.
  const goal = page.locator('[data-id="goal"]');
  await expect(goal).toContainText("0.73 of 1 × Conveyor");
  const clipped = await goal
    .locator("span.truncate")
    .evaluateAll((spans) =>
      spans.filter((span) => span.scrollWidth > span.clientWidth).map((span) => span.textContent),
    );
  expect(clipped).toEqual([]);

  await expect(page).toHaveScreenshot("rates-in-belts.png");
  const commands = await page.evaluate(() => window.carbonaraScene?.commands ?? []);
  expect(commands).toEqual([{ type: "setSettings", settings: { belt: "conveyor-1" } }]);
});

test("rounding to buildable spreads a machine count evenly", async ({ page }) => {
  await openScene(page, "chain&zoom=1&focus=smelt-iron");
  const smelter = page.locator('[data-id="smelt-iron"]');
  await expect(smelter).toContainText("3 × 100% + 1 × 75%");
  await page.getByRole("button", { name: /Round machines to buildable/ }).click();
  await expect(smelter).toContainText("4 × 93.75%");
  await page.getByRole("button", { name: /Round machines to buildable/ }).click();
  await expect(smelter).toContainText("3 × 100% + 1 × 75%");
});

test("fitting a machine to demand pins the count its consumers want", async ({ page }) => {
  await openInApp(page, congested);
  await page.keyboard.press("Shift+F");
  await page.locator('[data-id="gears"]').click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const balance = inspector.getByRole("group", { name: "Balance" });
  // The goal wants 15 gears a second; an assembler makes one a second.
  await expect(balance.getByRole("button", { name: /Fit to demand/ })).toContainText("15");
  await balance.getByRole("button", { name: /Fit to demand/ }).click();
  await expect(inspector).toContainText("Set by you");
  await expect(inspector.getByLabel("Machines")).toHaveValue("15");
});
