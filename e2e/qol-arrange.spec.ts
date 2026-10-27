// Auto-arrange and lock in the live app (docs/Design/Editor-quality-of-life.md, Layout and alignment).
import { expect, test } from "@playwright/test";
import { chain } from "../src/client/canvas/scenes/chain";
import { congested } from "../src/client/canvas/scenes/congested";
import { flowPosition, nodeBoxes, openInApp, overlaps } from "./qol-helpers";

test("Shift+A arranges the whole factory left to right without overlaps", async ({ page }) => {
  await openInApp(page, chain);
  const before = await flowPosition(page, "ferrite-ore");
  await page.keyboard.press("Shift+A");
  // The first arrange starts ELK's worker, which the dev server compiles on demand. Nodes that leave the view
  // aren't drawn, so this follows one that stays, then shows everything.
  await expect.poll(() => flowPosition(page, "ferrite-ore"), { timeout: 20_000 }).not.toEqual(before);
  await page.keyboard.press("f");
  await expect(page.locator(".react-flow__node")).toHaveCount(20);
  await expect.poll(async () => overlaps(await nodeBoxes(page))).toEqual([]);
  // Producers sit left of their consumers.
  expect((await flowPosition(page, "ferrite-ore")).x).toBeLessThan((await flowPosition(page, "wash")).x);
  expect((await flowPosition(page, "motors")).x).toBeLessThan((await flowPosition(page, "goal")).x);
  await expect(page).toHaveScreenshot("arranged-chain.png");
});

test("top to bottom from the palette, and locked nodes stay put", async ({ page }) => {
  await openInApp(page, congested);
  await page.locator('.react-flow__node[data-id="goal"]').click();
  await page.keyboard.press("Shift+L");
  await expect(page.locator('.react-flow__node[data-id="goal"]')).toHaveClass(/is-locked/);
  const goal = await flowPosition(page, "goal");
  const gears = await flowPosition(page, "gears");

  await page.keyboard.press("Escape");
  await page.locator(".react-flow__pane").click({ position: { x: 700, y: 820 } });
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("arrange top");
  await page.getByRole("option", { name: /Arrange top to bottom/ }).click();
  await expect.poll(() => flowPosition(page, "gears"), { timeout: 20_000 }).not.toEqual(gears);
  expect(await flowPosition(page, "goal")).toEqual(goal);
  // Top to bottom: the ore comes before the washers, which come before the gears.
  expect((await flowPosition(page, "ore")).y).toBeLessThan((await flowPosition(page, "wash-a")).y);
  expect((await flowPosition(page, "wash-a")).y).toBeLessThan((await flowPosition(page, "gears")).y);
  // Flows enter the arranged nodes at the top and leave at the bottom; the locked goal keeps its side port.
  const gearsNode = page.locator('.react-flow__node[data-id="gears"]');
  await expect(gearsNode.locator(".react-flow__handle-top")).toHaveCount(1);
  await expect(gearsNode.locator(".react-flow__handle-bottom")).toHaveCount(1);
  await expect(page.locator('.react-flow__node[data-id="goal"] .react-flow__handle-left')).toHaveCount(1);
  await page.keyboard.press("f");
  await expect.poll(async () => overlaps(await nodeBoxes(page))).toEqual([]);
  await expect(page).toHaveScreenshot("arranged-congested-down.png");

  // Left to right turns them back.
  await page.keyboard.press("Shift+A");
  await expect(gearsNode.locator(".react-flow__handle-left")).toHaveCount(1);
  await expect(page.locator(".react-flow__handle-top")).toHaveCount(0);
});

test("a locked node can't be dragged", async ({ page }) => {
  await openInApp(page, congested);
  const goal = page.locator('.react-flow__node[data-id="goal"]');
  await goal.click();
  await page.keyboard.press("Shift+L");
  await expect(goal).toHaveClass(/is-locked/);
  const before = await flowPosition(page, "goal");
  const box = await goal.boundingBox();
  if (!box) throw new Error("goal not on screen");
  await page.mouse.move(box.x + 40, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 120, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press("ArrowRight");
  expect(await flowPosition(page, "goal")).toEqual(before);
});

test("nodes added from the palette land clear of the ones already there", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "New factory" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New factory" });
  await dialog.getByLabel("Name").fill("Plates");
  await dialog.getByRole("button", { name: "Create" }).click();
  for (const count of [1, 2, 3]) {
    await page.keyboard.press("ControlOrMeta+K");
    await page.keyboard.type("copper plate");
    await page.keyboard.press("Enter");
    await expect(page.locator(".react-flow__node")).toHaveCount(count);
  }
  expect(overlaps(await nodeBoxes(page))).toEqual([]);
});
