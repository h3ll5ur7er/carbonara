// The goal planner in the live app: plan a goal, see the proposal as a ghost, accept it, find it laid out in
// the graph, and take it back in one undo step (docs/Design.md, Goal planner).
import { expect, test, type Page } from "@playwright/test";

async function newFactory(page: Page, name: string) {
  await page.getByRole("button", { name: "New factory" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New factory" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
}

/** Plans `rate` per second of the item the query finds, in a new factory. */
async function planGoal(page: Page, query: string, rate: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await newFactory(page, "Motors");
  await page.keyboard.press("p");
  const planner = page.getByRole("region", { name: "Plan production" });
  await expect(planner).toBeVisible();
  const item = planner.getByLabel("Goal 1 item");
  await expect(item).toBeFocused();
  await item.fill(query);
  await page.keyboard.press("Enter");
  const goalRate = planner.getByLabel("Goal 1 rate");
  await goalRate.fill(rate);
  await goalRate.press("Enter");
  await planner.getByRole("button", { name: "Plan", exact: true }).click();
  return planner;
}

const ghosts = (page: Page) => page.locator(".react-flow__node.ghost");
const realNodes = (page: Page) => page.locator(".react-flow__node:not(.ghost):not(.ghost-frame)");

test("plans a goal, shows it as a ghost, and accepts it as one undo step", async ({ page }) => {
  const planner = await planGoal(page, "motor", "0.25");

  // The proposal: a ghost on the canvas and its summary in the card.
  await expect(ghosts(page).first()).toBeVisible();
  const proposed = await ghosts(page).count();
  expect(proposed).toBeGreaterThan(8);
  await expect(realNodes(page)).toHaveCount(0);
  await expect(planner.getByRole("heading", { name: "Proposal" })).toBeVisible();
  await expect(planner.getByRole("region", { name: "Buildings" })).toContainText("Assembler");
  await expect(planner.getByRole("region", { name: "Raw inputs" })).toContainText("Ferrite Ore");
  await expect(planner.getByRole("region", { name: "Byproducts" })).toContainText("Slag");

  await planner.getByRole("button", { name: "Accept" }).click();
  await expect(planner).toContainText("Added to Motors");
  await expect(ghosts(page)).toHaveCount(0);
  await expect(realNodes(page)).toHaveCount(proposed);

  // Laid out left to right: ore enters on the left, the motors leave on the right.
  const box = async (id: string) => {
    const found = await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox();
    if (!found) throw new Error(`${id} not on screen`);
    return found;
  };
  await page.keyboard.press("f");
  const ore = await box("source-ferrite-ore");
  const motors = await box("motor");
  const output = await box("output-motor");
  expect(ore.x).toBeLessThan(motors.x);
  expect(motors.x + motors.width).toBeLessThan(output.x);

  // The factory solves to the goal: 2.5 motor assemblers make the 0.25 motors a second.
  await page.locator('.react-flow__node[data-id="output-motor"]').click();
  await page.keyboard.press("Shift+F");
  await expect(page.locator('.react-flow__node[data-id="output-motor"]')).toContainText("100% of 0.25/s");
  await expect(page.locator('.react-flow__node[data-id="motor"]')).toContainText("2 × 100% + 1 × 50%");

  await planner.getByRole("button", { name: "Undo" }).click();
  await expect(realNodes(page)).toHaveCount(0);
  await expect(planner).toBeHidden();
});

test("discarding a proposal leaves the factory as it was", async ({ page }) => {
  const planner = await planGoal(page, "iron gear", "1");
  await expect(ghosts(page).first()).toBeVisible();
  await planner.getByRole("button", { name: "Discard" }).click();
  await expect(ghosts(page)).toHaveCount(0);
  await expect(realNodes(page)).toHaveCount(0);
  await expect(page.getByText("This factory is empty")).toBeVisible();
});

test("adjusting goes back to the goals and plans again", async ({ page }) => {
  const planner = await planGoal(page, "iron plate", "1");
  await expect(planner.getByRole("region", { name: "Buildings" })).toContainText("Water Purifier");
  await planner.getByRole("button", { name: "Adjust" }).click();
  // Fewest buildings: the purifier only saves water.
  await planner.getByRole("tab", { name: "Buildings" }).click();
  await planner.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(planner.getByRole("region", { name: "Buildings" })).not.toContainText("Water Purifier");
  await expect(planner.getByRole("region", { name: "Buildings" })).toContainText("Furnace");
});

test("the proposal's ghost drags as one, and is accepted where it was left", async ({ page }) => {
  const planner = await planGoal(page, "iron plate", "1");
  const frame = page.locator(".react-flow__node.ghost-frame");
  await expect(frame).toBeVisible();
  const smelter = page.locator('.react-flow__node.ghost[data-id="ghost:iron-plate"]');
  const before = await smelter.boundingBox();
  const handle = await frame.boundingBox();
  if (!before || !handle) throw new Error("ghost not on screen");
  // Grab the frame by its label, above the cards.
  await page.mouse.move(handle.x + 40, handle.y + 4);
  await page.mouse.down();
  await page.mouse.move(handle.x + 40, handle.y + 4 + 150, { steps: 10 });
  await page.mouse.up();
  const after = await smelter.boundingBox();
  expect(after?.y ?? 0).toBeGreaterThan(before.y + 100);
  expect(Math.abs((after?.x ?? 0) - before.x)).toBeLessThan(2);

  await planner.getByRole("button", { name: "Accept" }).click();
  const placed = await page.locator('.react-flow__node[data-id="iron-plate"]').boundingBox();
  expect(Math.abs((placed?.y ?? 0) - (after?.y ?? 0))).toBeLessThan(2);
});

test("plans in the buildings asked for", async ({ page }) => {
  const planner = await planGoal(page, "motor", "0.25");
  await expect(planner.getByRole("region", { name: "Buildings" })).toContainText("Assembler");
  await planner.getByRole("button", { name: "Adjust" }).click();
  await planner.getByLabel("Recipes for the Assembler run in").click();
  await page.getByRole("option", { name: "Fast Assembler" }).click();
  await planner.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(planner.getByRole("region", { name: "Buildings" })).toContainText("Fast Assembler");
  await planner.getByRole("button", { name: "Accept" }).click();
  // Twice as fast: 1.25 fast assemblers make the motors that took 2.5 assemblers.
  await expect(page.locator('.react-flow__node[data-id="motor"]')).toContainText("× 1.25");
});
