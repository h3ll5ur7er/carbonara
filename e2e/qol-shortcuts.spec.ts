// The cheat sheet and shortcut editor, context menus, and exporting a picture
// (docs/Design/Editor-quality-of-life.md, General).
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { chain } from "../src/client/canvas/scenes/chain";
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

function zoom(page: Page) {
  return page
    .locator(".react-flow__viewport")
    .evaluate((viewport) => new DOMMatrix(getComputedStyle(viewport).transform).a);
}

test("? shows every shortcut, and a shortcut can be changed, clashes named, and reset", async ({ page }) => {
  await openInApp(page, chain);
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("region", { name: "View" })).toContainText("Zoom to fit");
  await expect(sheet).toHaveScreenshot("cheat-sheet.png");

  await sheet.getByLabel("Filter commands").fill("zoom to fit");
  await sheet.getByRole("button", { name: "Change shortcut for Zoom to fit" }).click();
  await page.keyboard.press("Shift+A");
  await expect(sheet).toContainText("Shift A is taken by Arrange left to right");
  await page.keyboard.press("z");
  await expect(sheet.locator("kbd").filter({ hasText: /^Z$/ })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // F no longer fits; Z does. And the choice survives a reload.
  await page.keyboard.press("Shift+F");
  const close = await zoom(page);
  await page.keyboard.press("f");
  expect(await zoom(page)).toBeCloseTo(close);
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(20);
  await page.keyboard.press("z");
  await expect.poll(() => zoom(page)).toBeLessThan(1);

  await page.keyboard.press("?");
  await sheet.getByLabel("Filter commands").fill("zoom to fit");
  await sheet.getByRole("button", { name: "Reset shortcut for Zoom to fit" }).click();
  await expect(sheet.locator("kbd").filter({ hasText: /^F$/ })).toHaveCount(1);
});

test("right-clicking a node offers what applies to it, and Delete there deletes it", async ({ page }) => {
  await openScene(page, "congested&zoom=1&focus=gears");
  await page.locator('[data-id="gears"] header').click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toContainText([
    "Add to favourites",
    "Zoom to selection",
    "Arrange left to right",
  ]);
  await expect(page).toHaveScreenshot("context-menu-node.png");
  await menu.getByRole("menuitem", { name: /Delete selection/ }).click();
  expect(await appliedCommands(page)).toEqual([expect.objectContaining({ type: "removeNodes", ids: ["gears"] })]);
});

test("right-clicking empty canvas offers the canvas's commands; a right-drag still pans", async ({ page }) => {
  await openScene(page, "congested&zoom=1&focus=gears");
  const pane = page.locator(".react-flow__pane");
  await pane.click({ button: "right", position: { x: 360, y: 120 } });
  await expect(page.getByRole("menuitem", { name: /Add note/ })).toBeVisible();
  await page.keyboard.press("Escape");

  const before = await page
    .locator(".react-flow__viewport")
    .evaluate((viewport) => getComputedStyle(viewport).transform);
  // From the same empty spot.
  const box = await pane.boundingBox();
  const start = { x: (box?.x ?? 0) + 360, y: (box?.y ?? 0) + 120 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(start.x + 120, start.y + 60, { steps: 8 });
  await page.mouse.up({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(
    await page.locator(".react-flow__viewport").evaluate((viewport) => getComputedStyle(viewport).transform),
  ).not.toBe(before);
});

test("the whole factory exports as a PNG and an SVG", async ({ page }) => {
  await openInApp(page, chain);
  for (const [format, check] of [
    ["PNG", (bytes: Buffer) => expect(bytes.subarray(1, 4).toString()).toBe("PNG")],
    ["SVG", (bytes: Buffer) => expect(bytes.toString()).toContain("<svg")],
  ] as const) {
    await page.keyboard.press("ControlOrMeta+K");
    await page.keyboard.type(`export picture ${format}`);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("option", { name: new RegExp(`Export picture \\(${format}\\)`) }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`chain.${format.toLowerCase()}`);
    const bytes = readFileSync(await download.path());
    check(bytes);
    // Every node is in it, also those off screen.
    if (format === "SVG") expect(bytes.toString().match(/react-flow__node /g)?.length ?? 0).toBeGreaterThanOrEqual(20);
  }
});
