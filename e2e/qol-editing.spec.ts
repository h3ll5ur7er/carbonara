// Deleting, delete & bridge, inserting a node into a flow and rewiring a flow's end
// (docs/Design/Editor-quality-of-life.md, Editing).
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

async function box(page: Page, selector: string) {
  const found = await page.locator(selector).boundingBox();
  if (!found) throw new Error(`${selector} not on screen`);
  return found;
}

const edge = (from: string, to: string) => `[aria-label="Edge from ${from} to ${to}"]`;

test("Delete and Backspace delete the selected nodes and flows as one edit each", async ({ page }) => {
  await openScene(page, "congested&zoom=1&focus=gears");
  await page.locator('[data-id="gears"] header').click();
  await page.keyboard.press("Delete");
  await expect(page.locator('[data-id="gears"]')).toHaveCount(0);

  await page.locator('[data-id="plate-merge"]').click();
  await page.keyboard.press("Backspace");
  await expect(page.locator('[data-id="plate-merge"]')).toHaveCount(0);
  expect(await appliedCommands(page)).toEqual([
    expect.objectContaining({ type: "removeNodes", ids: ["gears"] }),
    expect.objectContaining({ type: "removeNodes", ids: ["plate-merge"] }),
  ]);
});

test("a selected flow is deleted on its own", async ({ page }) => {
  await openScene(page, "congested&zoom=1&focus=plate-merge");
  const flow = await box(page, edge("smelt-b", "plate-merge"));
  await page.mouse.click(flow.x + flow.width / 2, flow.y + flow.height / 2);
  await page.keyboard.press("Delete");
  await expect(page.locator(edge("smelt-b", "plate-merge"))).toHaveCount(0);
  expect(await appliedCommands(page)).toEqual([expect.objectContaining({ type: "disconnect", ids: ["plates-b"] })]);
});

test("delete & bridge keeps the flow connected, and undo brings the node back", async ({ page }) => {
  await openInApp(page, chain);
  await page.keyboard.press("Shift+F");
  await page.locator('[data-id="plate-split"]').click();
  await page.keyboard.press("ControlOrMeta+Shift+Delete");
  await expect(page.locator('[data-id="plate-split"]')).toHaveCount(0);
  await expect(page.locator(edge("smelt-iron", "gears"))).toHaveCount(1);
  await expect(page.locator(edge("smelt-iron", "circuits"))).toHaveCount(1);

  await page.keyboard.press("ControlOrMeta+Z");
  await expect(page.locator('[data-id="plate-split"]')).toHaveCount(1);
  await expect(page.locator(edge("smelt-iron", "gears"))).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  await expect(page.locator('[data-id="plate-split"]')).toHaveCount(0);
});

test("dropping a node onto a flow inserts it there", async ({ page }) => {
  await openScene(page, "congested&zoom=1&focus=gears");
  // A junction with no flows yet, below the gear line.
  await page.evaluate(() =>
    window.carbonaraScene?.connector.editing.apply({
      documentId: "scene-congested",
      commands: [{ type: "addNode", id: "loose", node: { kind: "junction" }, position: { x: 1560, y: 600 } }],
    }),
  );
  const loose = await box(page, '[data-id="loose"]');
  const gears = await box(page, '[data-id="gears"]');
  const goal = await box(page, '[data-id="goal"]');
  // Between the assembler and the goal, on the gears' flow.
  const target = { x: (gears.x + gears.width + goal.x) / 2, y: goal.y + goal.height / 2 };
  await page.mouse.move(loose.x + loose.width / 2, loose.y + loose.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 16 });
  await expect(page.locator(".react-flow__edge.is-insert-target")).toHaveCount(1);
  await expect(page).toHaveScreenshot("insert-target.png", { animations: "disabled" });
  await page.mouse.up();

  const commands = await appliedCommands(page);
  expect(commands.slice(1)).toEqual([
    expect.objectContaining({ type: "disconnect", ids: ["gears-out"] }),
    expect.objectContaining({
      type: "connect",
      edge: expect.objectContaining({ from: "gears", to: "loose", item: "iron-gear" }),
    }),
    expect.objectContaining({
      type: "connect",
      edge: expect.objectContaining({ from: "loose", to: "goal", item: "iron-gear" }),
    }),
    expect.objectContaining({ type: "moveNodes", positions: { loose: expect.anything() } }),
  ]);
  await expect(page.locator(edge("gears", "loose"))).toHaveCount(1);
});

test("Alt-dragging the end of a flow moves it to another port", async ({ page }) => {
  await openScene(page, "congested&zoom=1&focus=plate-merge");
  const merge = await box(page, '[data-id="plate-merge"]');
  // The plates-a flow ends at the merge's input, on its left edge; pick it up just outside the node.
  const end = { x: merge.x - 6, y: merge.y + merge.height / 2 };
  const port = await box(page, '[data-id="gears"] [data-handleid="in:iron-plate"]');
  await page.mouse.move(end.x - 40, end.y - 40);
  await page.keyboard.down("Alt");
  await expect(page.locator(".alt-held")).toHaveCount(1);
  await page.mouse.move(end.x, end.y);
  await page.mouse.down();
  await page.mouse.move(port.x + port.width / 2, port.y + port.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up("Alt");

  const [disconnect, connect] = await appliedCommands(page);
  expect(disconnect).toMatchObject({ type: "disconnect" });
  expect(connect).toMatchObject({ type: "connect", edge: { to: "gears", item: "iron-plate" } });
});
