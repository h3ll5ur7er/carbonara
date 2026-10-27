// Screenshots of the goal planner (scene `planner`): a proposal as a ghost beside a copper line with its
// summary card, and the goals form, in dark and light. After an intentional visual change:
// `pnpm e2e --update-snapshots=all`, look at every changed image, and commit them with the change.
import { expect, test, type Page } from "@playwright/test";

async function openPlanner(page: Page, colorScheme: "dark" | "light") {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  await page.goto("/?scene=planner");
  await expect(page.locator('[data-scene="planner"]')).toBeAttached();
  await expect(page.locator(".react-flow__node.ghost").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return page.getByRole("region", { name: "Plan production" });
}

for (const colorScheme of ["dark", "light"] as const) {
  test(`a proposal as a ghost with its summary, in ${colorScheme}`, async ({ page }) => {
    await openPlanner(page, colorScheme);
    await expect(page).toHaveScreenshot(`proposal-${colorScheme}.png`, { animations: "disabled" });
  });

  test(`the goals, with the proposal still shown, in ${colorScheme}`, async ({ page }) => {
    const planner = await openPlanner(page, colorScheme);
    await planner.getByRole("button", { name: "Adjust" }).click();
    await planner.getByRole("button", { name: "Add a goal" }).click();
    await expect(planner.getByLabel("Goal 2 item")).toBeVisible();
    // The options: the building the assembler's recipes run in, and the raw resources' weights.
    await expect(planner.getByLabel("Recipes for the Assembler run in")).toHaveText(/Assembler/);
    await planner.getByRole("button", { name: /Resource weights/ }).click();
    await expect(planner.getByLabel("Weight of Water")).toBeVisible();
    await expect(page).toHaveScreenshot(`goals-${colorScheme}.png`, { animations: "disabled" });
  });
}

test("the goal picker lists matching items, made ones first", async ({ page }) => {
  const planner = await openPlanner(page, "dark");
  await planner.getByRole("button", { name: "Adjust" }).click();
  const item = planner.getByLabel("Goal 1 item");
  await item.click();
  await item.fill("plate");
  await expect(planner.getByRole("option")).toHaveText([/Iron Plate$/, /Copper Plate$/]);
  await expect(page).toHaveScreenshot("goal-picker-dark.png", { animations: "disabled" });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(item).toHaveValue("Copper Plate");
});

test("accepting adds the proposal where its ghost was, as one batch", async ({ page }) => {
  const planner = await openPlanner(page, "dark");
  const ghosts = await page.locator(".react-flow__node.ghost").count();
  await planner.getByRole("button", { name: "Accept" }).click();
  await expect(planner).toContainText("Added to Copper works");
  await expect(page.locator(".react-flow__node.ghost")).toHaveCount(0);
  await expect(page.locator(".react-flow__node:not(.ghost-frame)")).toHaveCount(5 + ghosts);
});
