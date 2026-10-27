// Selecting, snapping, nudging and zooming on the canvas (docs/Design/Editor-quality-of-life.md).
import { expect, test, type Page } from "@playwright/test";

async function openScene(page: Page, query: string) {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(`/?scene=${query}`);
  await expect(page.locator(".react-flow__node").first()).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
}

function appliedCommands(page: Page) {
  return page.evaluate(() => window.carbonaraScene?.commands ?? []);
}

async function centreOf(page: Page, node: string) {
  const box = await page.locator(`[data-id="${node}"]`).boundingBox();
  if (!box) throw new Error(`${node} not on screen`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, top: box.y };
}

function selectedIds(page: Page) {
  return page.locator(".react-flow__node.selected").evaluateAll((nodes) => nodes.map((node) => node.dataset.id));
}

/** The canvas's zoom, from the viewport's transform. */
function zoom(page: Page) {
  return page
    .locator(".react-flow__viewport")
    .evaluate((viewport) => new DOMMatrix(getComputedStyle(viewport).transform).a);
}

async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 12 });
}

test("dragging on empty canvas selects the nodes the box touches", async ({ page }) => {
  await openScene(page, "congested&zoom=0.9&focus=smelt-a");
  const smelter = await centreOf(page, "smelt-a");
  // From empty canvas above and left of the first smelter, down across both smelters.
  await drag(page, { x: smelter.x - 200, y: smelter.top - 30 }, { x: 230, y: 420 });
  await page.mouse.up();
  expect((await selectedIds(page)).sort()).toEqual(["smelt-a", "smelt-b"]);
});

test("Alt-dragging draws a lasso that selects the nodes whose centre it encloses", async ({ page }) => {
  await openScene(page, "congested&zoom=0.9&focus=smelt-a");
  const smelter = await centreOf(page, "smelt-a");
  const corners = [
    { x: smelter.x - 180, y: smelter.y - 90 },
    { x: smelter.x + 180, y: smelter.y - 90 },
    { x: smelter.x + 180, y: smelter.y + 90 },
    { x: smelter.x - 180, y: smelter.y + 90 },
  ];
  await page.keyboard.down("Alt");
  await page.mouse.move(corners[0]?.x ?? 0, corners[0]?.y ?? 0);
  await page.mouse.down();
  for (const corner of corners.slice(1)) await page.mouse.move(corner.x, corner.y, { steps: 6 });
  await expect(page.locator(".lasso")).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up("Alt");
  expect(await selectedIds(page)).toEqual(["smelt-a"]);
});

test("a dragged node snaps into line with its neighbours, shows guides, and Alt bypasses it", async ({ page }) => {
  await openScene(page, "congested&zoom=0.9&focus=smelt-a");
  const washer = await centreOf(page, "wash-b");
  await drag(page, { x: washer.x, y: washer.top + 20 }, { x: 3, y: 40 });
  await expect(page.locator(".snap-guide").first()).toBeAttached();
  await page.mouse.up();
  await expect(page.locator(".snap-guide")).toHaveCount(0);

  const [snapped] = await appliedCommands(page);
  // wash-a's left edge is at x = 504; the grid is 24.
  expect(snapped).toMatchObject({ type: "moveNodes", positions: { "wash-b": { x: 504 } } });
  const y = snapped?.type === "moveNodes" ? snapped.positions["wash-b"]?.y : undefined;
  expect((y ?? 1) % 24).toBe(0);

  const moved = await centreOf(page, "wash-b");
  await page.keyboard.down("Alt");
  await drag(page, { x: moved.x, y: moved.top + 20 }, { x: 3, y: 40 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const [, free] = await appliedCommands(page);
  const x = free?.type === "moveNodes" ? free.positions["wash-b"]?.x : undefined;
  expect(x).not.toBe(504);
});

test("arrow keys nudge the selection by a grid step, four with Shift", async ({ page }) => {
  await openScene(page, "chain&zoom=1&focus=gears");
  await page.locator('[data-id="gears"] header').click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  expect(await appliedCommands(page)).toEqual([
    expect.objectContaining({ type: "moveNodes", positions: { gears: { x: 1344, y: 56 } } }),
    expect.objectContaining({ type: "moveNodes", positions: { gears: { x: 1344, y: 152 } } }),
  ]);
});

test("F zooms to fit the whole graph and Shift+F to the selection", async ({ page }) => {
  await openScene(page, "chain&zoom=1.5&focus=gears");
  await page.locator('[data-id="gears"] header').click();
  await page.keyboard.press("f");
  await expect.poll(() => zoom(page)).toBeLessThan(0.7);

  await page.keyboard.press("Shift+F");
  await expect.poll(() => zoom(page)).toBeGreaterThan(1);
  const gears = await centreOf(page, "gears");
  const canvas = await page.locator(".react-flow").boundingBox();
  if (!canvas) throw new Error("no canvas");
  // Centred in the part of the canvas the inspector leaves free.
  expect(gears.x).toBeLessThan(canvas.x + canvas.width - 300);
  expect(Math.abs(gears.y - (canvas.y + canvas.height / 2))).toBeLessThan(40);
});

test("zoom to fit and zoom to selection are in the command palette", async ({ page }) => {
  await openScene(page, "chain");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("zoom to");
  await expect(page.getByRole("option", { name: /Zoom to fit/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Zoom to selection/ })).toBeVisible();
});

test("equal spacing marks while dragging", async ({ page }) => {
  // The plate splitter sits halfway between the smelter and the gear assembler.
  await openScene(page, "chain&zoom=1.2&focus=plate-split");
  const splitter = await centreOf(page, "plate-split");
  await drag(page, splitter, { x: 4, y: -30 });
  await expect(page.locator(".snap-gap")).toHaveCount(2);
  await expect(page).toHaveScreenshot("spacing-marks.png", { animations: "disabled" });
  await page.mouse.up();
});
