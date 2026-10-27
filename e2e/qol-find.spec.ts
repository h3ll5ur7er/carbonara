// Find (Ctrl+F) with jump, replace recipe everywhere, and editing many nodes at once
// (docs/Design/Editor-quality-of-life.md, Find and multi-select editing).
import { expect, test, type Page } from "@playwright/test";
import { chain } from "../src/client/canvas/scenes/chain";
import { congested } from "../src/client/canvas/scenes/congested";
import { openInApp } from "./qol-helpers";

async function openScene(page: Page, query: string) {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(`/?scene=${query}`);
  await expect(page.locator(".react-flow__node").first()).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
}

function appliedCommands(page: Page) {
  return page.evaluate(() => window.carbonaraScene?.commands ?? []);
}

test("Ctrl+F finds nodes across the factory and Enter jumps to one", async ({ page }) => {
  await openInApp(page, chain);
  await page.keyboard.press("ControlOrMeta+F");
  const panel = page.getByRole("combobox", { name: "Find in factory" });
  await expect(panel).toBeFocused();
  await page.keyboard.type("gear");
  const options = page.getByRole("option");
  // The gear assembler, and the motor assembler that takes gears.
  await expect(options).toHaveText([/Iron Gear\s*Assembler/, /Motor\s*Assembler/]);
  // Motor Recycling gives gears back, but it's no recipe for making them.
  await expect(page.getByText(/Replace Iron Gear everywhere/)).toHaveCount(0);
  await expect(page).toHaveScreenshot("find-panel.png");

  await page.keyboard.press("Enter");
  await expect(page.locator('.react-flow__node[data-id="gears"]')).toHaveClass(/selected/);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator('.react-flow__node[data-id="motors"]')).toHaveClass(/selected/);
  await expect(page.locator('.react-flow__node[data-id="gears"]')).not.toHaveClass(/selected/);

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("a recipe found can be replaced everywhere in one edit", async ({ page }) => {
  await openInApp(page, congested);
  await page.keyboard.press("ControlOrMeta+F");
  await page.keyboard.type("furnace");
  await expect(page.getByRole("option")).toHaveCount(2);
  const replace = page.getByRole("group", { name: "Replace everywhere" });
  await replace.getByRole("button", { name: "Iron Plate (Coal Smelting)" }).click();
  await page.keyboard.press("Escape");

  await page.keyboard.press("f");
  for (const smelter of ["smelt-a", "smelt-b"]) {
    await expect(page.locator(`[data-id="${smelter}"]`)).toContainText("Coal Smelting");
  }
  // The washed ferrite no longer fits the smelters; their flows went in the same edit.
  await expect(page.locator('[aria-label="Edge from wash-a to smelt-a"]')).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(page.locator('[data-id="smelt-a"]')).not.toContainText("Coal Smelting");
  await expect(page.locator('[aria-label="Edge from wash-a to smelt-a"]')).toHaveCount(1);
});

test("the selection toolbar changes the recipe and the belts of every selected node", async ({ page }) => {
  await openScene(page, "congested&zoom=0.6&focus=smelt-a");
  await page.locator('[data-id="smelt-a"]').click();
  await page.locator('[data-id="smelt-b"]').click({ modifiers: ["Shift"] });
  const toolbar = page.getByRole("toolbar", { name: "Selection" });

  await toolbar.getByRole("button", { name: "Recipe" }).click();
  await page.getByRole("menuitem", { name: "Iron Plate (Coal Smelting)" }).click();
  await toolbar.getByRole("button", { name: "Belt" }).click();
  // Pipes don't carry the smelters' solids.
  await expect(page.getByRole("menuitem", { name: "Pipe" })).toBeDisabled();
  await page.getByRole("menuitem", { name: "Fast Conveyor" }).click();

  expect(await appliedCommands(page)).toEqual([
    expect.objectContaining({ type: "setRecipe", ids: ["smelt-a", "smelt-b"], recipe: "iron-plate-from-ore" }),
    expect.objectContaining({ type: "disconnect", ids: ["clean-a", "clean-b"] }),
    // The washed ferrite flows went with the recipe change; the plates remain.
    expect.objectContaining({ type: "setLogistics", ids: ["plates-a", "plates-b"], logistics: "conveyor-2" }),
  ]);
});
