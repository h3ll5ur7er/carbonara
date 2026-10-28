// Copy, cut, paste and duplicate with the paste ghost, in the live app (real backend worker and editing engine)
// (docs/Design/Editor-quality-of-life.md, Clipboard and ghost placement).
import { expect, test, type Page } from "@playwright/test";
import { chain } from "../src/client/canvas/scenes/chain";
import { congested } from "../src/client/canvas/scenes/congested";
import { subgraphScene } from "../src/client/canvas/scenes/subgraph";
import { writeShareLink } from "../src/access/documents/share-links";
import { flowPosition, openInApp } from "./qol-helpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const GRID = 24;
const documentNodes = (page: Page) => page.locator(".react-flow__node:not(.ghost):not(.ghost-frame)");
const ghostNodes = (page: Page) => page.locator(".react-flow__node.ghost");
const edge = (from: string, to: string) => `[aria-label="Edge from ${from} to ${to}"]`;
const NODES = Object.keys(congested.nodes).length;

async function selectWashAndSmelt(page: Page) {
  await page.locator('.react-flow__node[data-id="wash-a"]').click();
  await page.locator('.react-flow__node[data-id="smelt-a"]').click({ modifiers: ["Shift"] });
}

/** The ids of the nodes the scene didn't have. */
function addedIds(page: Page) {
  return documentNodes(page).evaluateAll(
    (nodes, known) => nodes.map((node) => (node as HTMLElement).dataset.id ?? "").filter((id) => !known.includes(id)),
    Object.keys(congested.nodes),
  );
}

/** The canvas's empty middle, below the factory, in screen pixels. */
async function emptySpot(page: Page) {
  const pane = await page.locator(".react-flow__pane").boundingBox();
  if (!pane) throw new Error("no canvas");
  return { x: pane.x + pane.width / 2, y: pane.y + pane.height - 140 };
}

test("copy, then paste: a ghost follows the pointer, a click places it under new ids, one undo removes it", async ({
  page,
}) => {
  await openInApp(page, congested);
  await selectWashAndSmelt(page);
  await page.keyboard.press("ControlOrMeta+C");
  await expect(page.getByText("Copied 2 nodes", { exact: true })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+V");
  await expect(ghostNodes(page)).toHaveCount(2);
  await expect(page.getByText("Paste 2 nodes · click to place")).toBeVisible();
  await expect(page.getByText("· Esc to cancel")).toBeVisible();

  // The ghost's centre follows the pointer, wherever it goes on the canvas (over nodes too).
  const spot = await emptySpot(page);
  await page.mouse.move(spot.x - 200, spot.y);
  await page.mouse.move(spot.x, spot.y, { steps: 5 });
  const frame = await page.locator(".react-flow__node.ghost-frame").boundingBox();
  if (!frame) throw new Error("no ghost frame");
  expect(Math.abs(frame.x + frame.width / 2 - spot.x)).toBeLessThan(GRID);
  expect(Math.abs(frame.y + frame.height / 2 - spot.y)).toBeLessThan(GRID);

  await page.mouse.click(spot.x, spot.y);
  await expect(ghostNodes(page)).toHaveCount(0);
  await expect(documentNodes(page)).toHaveCount(NODES + 2);
  const added = await addedIds(page);
  expect(added).toEqual([expect.stringMatching(/^wash-a-[0-9a-f]{6}$/), expect.stringMatching(/^smelt-a-/)]);
  // With the flow between them, their top-left corner on the grid, as they were to each other, and selected.
  const [wash = "", smelt = ""] = added;
  await expect(page.locator(edge(wash, smelt))).toHaveCount(1);
  const washAt = await flowPosition(page, wash);
  const smeltAt = await flowPosition(page, smelt);
  expect(washAt.x % GRID).toBe(0);
  expect(washAt.y % GRID).toBe(0);
  const { x, y } = congested.nodes["wash-a"] ?? { x: 0, y: 0 };
  const smeltWas = congested.nodes["smelt-a"] ?? { x: 0, y: 0 };
  expect({ x: smeltAt.x - washAt.x, y: smeltAt.y - washAt.y }).toEqual({ x: smeltWas.x - x, y: smeltWas.y - y });
  for (const id of added) await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toHaveClass(/selected/);

  await page.keyboard.press("ControlOrMeta+Z");
  await expect(documentNodes(page)).toHaveCount(NODES);
});

for (const colorScheme of ["dark", "light"] as const) {
  test(`a following ghost snaps into line with its neighbours and shows the guides, in ${colorScheme}`, async ({
    page,
  }) => {
    await openInApp(page, congested, colorScheme);
    const gears = page.locator('.react-flow__node[data-id="gears"]');
    await gears.click();
    await page.keyboard.press("ControlOrMeta+C");
    await expect(page.getByText("Copied 1 node", { exact: true })).toBeVisible();
    // Toasts wait for the pointer to leave them; this one shouldn't be in the picture.
    const dismiss = page.getByRole("button", { name: "Dismiss" });
    while ((await dismiss.count()) > 0) await dismiss.first().click();
    await page.keyboard.press("ControlOrMeta+V");
    await expect(ghostNodes(page)).toHaveCount(1);
    // Two pixels off the gears' column, well below them: the ghost lines up with them.
    const box = await gears.boundingBox();
    if (!box) throw new Error("no gears");
    await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2 + 300, { steps: 4 });
    await expect(page.locator(".snap-guide")).not.toHaveCount(0);
    await expect.poll(async () => (await flowPosition(page, "ghost:gears")).x).toBe(congested.nodes.gears?.x);
    await expect(page).toHaveScreenshot(`ghost-follows-${colorScheme}.png`);
  });
}

test("Escape cancels a paste, and the copy is plain text on the system clipboard", async ({ page }) => {
  await openInApp(page, congested);
  await selectWashAndSmelt(page);
  await page.keyboard.press("ControlOrMeta+C");
  await expect(page.getByText("Copied 2 nodes", { exact: true })).toBeVisible();
  // The write finishes on its own time, after the copy arrived.
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("carbonara-clipboard");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(JSON.parse(text)).toMatchObject({
    format: "carbonara-clipboard",
    pack: { id: "template" },
    graph: { nodes: { "wash-a": { kind: "recipe" }, "smelt-a": { kind: "recipe" } } },
  });

  await page.keyboard.press("ControlOrMeta+V");
  await expect(ghostNodes(page)).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(ghostNodes(page)).toHaveCount(0);
  await expect(documentNodes(page)).toHaveCount(NODES);
});

test("paste with connections reconnects to the nodes the copy was connected to", async ({ page }) => {
  await openInApp(page, congested);
  await selectWashAndSmelt(page);
  await page.keyboard.press("ControlOrMeta+C");
  await expect(page.getByText("Copied 2 nodes", { exact: true })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Shift+V");
  await expect(ghostNodes(page)).toHaveCount(2);
  await page.keyboard.press("Enter");
  await expect(documentNodes(page)).toHaveCount(NODES + 2);
  const [wash, smelt] = await addedIds(page);
  for (const flow of [edge("ore-split", wash ?? ""), edge("water", wash ?? ""), edge(smelt ?? "", "plate-merge")]) {
    await expect(page.locator(flow)).toHaveCount(1);
  }
});

test("cut removes the nodes in one edit; pasting brings them back", async ({ page }) => {
  await openInApp(page, congested);
  await selectWashAndSmelt(page);
  await page.keyboard.press("ControlOrMeta+X");
  await expect(documentNodes(page)).toHaveCount(NODES - 2);
  await page.keyboard.press("ControlOrMeta+V");
  await expect(ghostNodes(page)).toHaveCount(2);
  await page.keyboard.press("Enter");
  await expect(documentNodes(page)).toHaveCount(NODES);
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(documentNodes(page)).toHaveCount(NODES - 2);
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(documentNodes(page)).toHaveCount(NODES);
});

test("duplicate shows a ghost beside the originals that the keyboard can move and place", async ({ page }) => {
  await openInApp(page, congested);
  await page.locator('.react-flow__node[data-id="gears"]').click();
  await page.keyboard.press("ControlOrMeta+D");
  await expect(ghostNodes(page)).toHaveCount(1);
  await expect(page.getByText("Duplicate 1 node · click to place")).toBeVisible();
  // It starts beside the original, about two grid steps right and down (snapped).
  const original = await flowPosition(page, "gears");
  const start = await flowPosition(page, "ghost:gears");
  expect(Math.abs(start.x - original.x - 2 * GRID)).toBeLessThanOrEqual(GRID);
  expect(Math.abs(start.y - original.y - 2 * GRID)).toBeLessThanOrEqual(GRID);
  // Arrow keys move it a grid step, four with Shift.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(() => flowPosition(page, "ghost:gears")).toEqual({ x: start.x + 4 * GRID, y: start.y + GRID });
  await page.keyboard.press("Enter");
  await expect(documentNodes(page)).toHaveCount(NODES + 1);
  const [copy] = await addedIds(page);
  expect(await flowPosition(page, copy ?? "")).toEqual({ x: start.x + 4 * GRID, y: start.y + GRID });
});

test("a copy pastes into another factory, in another tab", async ({ page, context }) => {
  await openInApp(page, congested);
  await selectWashAndSmelt(page);
  await page.keyboard.press("ControlOrMeta+C");
  await expect(page.getByText("Copied 2 nodes", { exact: true })).toBeVisible();

  // Another tab has a backend of its own: only the system clipboard reaches it.
  const other = await context.newPage();
  await openInApp(other, chain);
  await other.keyboard.press("ControlOrMeta+V");
  await expect(ghostNodes(other)).toHaveCount(2);
  await other.keyboard.press("Enter");
  await expect(documentNodes(other)).toHaveCount(Object.keys(chain.nodes).length + 2);
});

test("a copied subgraph brings its blueprint into another factory, as one undo step", async ({ page, context }) => {
  const { document } = subgraphScene({
    units: { rate: "per_second" },
    items: [],
    buildings: [],
    recipes: [],
    logistics: [],
    resources: [],
    starters: [],
    categories: [],
    unlocks: [],
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(`/#doc=${writeShareLink(document)}`);
  await page.locator('.react-flow__node[data-id="line-a"]').click();
  await page.keyboard.press("ControlOrMeta+C");
  await expect(page.getByText("Copied 1 node", { exact: true })).toBeVisible();

  // The chain has no blueprints: the ghost shows the instance with the one it brings along all the same.
  const other = await context.newPage();
  await openInApp(other, chain);
  await other.keyboard.press("ControlOrMeta+V");
  await expect(ghostNodes(other)).toContainText("Copper Wire line");
  await other.keyboard.press("Enter");
  const instance = other.locator(".react-flow__node-instance:not(.ghost)");
  await expect(instance).toContainText("Copper Wire line");
  // Close enough to read its ports.
  await other.keyboard.press("Shift+F");
  await expect(instance.locator("li")).toHaveText([/Cuprite Ore/, /Copper Wire/, /Slag/]);
  const library = other.getByRole("complementary", { name: "Library" });
  await library.getByRole("tab", { name: /Blueprints/ }).click();
  await expect(library.getByRole("button", { name: /^Copper Wire line/ })).toContainText("Placed once");

  await other.keyboard.press("ControlOrMeta+Z");
  await expect(instance).toHaveCount(0);
  await expect(library).toContainText("No blueprints yet");
});

test("pasting nodes from another pack warns about what doesn't exist here", async ({ page }) => {
  await openInApp(page, congested);
  const foreign = {
    format: "carbonara-clipboard",
    version: 1,
    pack: { id: "factorio", version: "2.0.0" },
    source: { documentId: "elsewhere", graph: "root" },
    graph: { nodes: { gear: { kind: "recipe", recipe: "iron-gear-wheel" } }, edges: {} },
    layout: { gear: { x: 0, y: 0 } },
    connections: {},
  };
  await page.evaluate((text) => navigator.clipboard.writeText(text), JSON.stringify(foreign));
  await page.locator(".react-flow__pane").click({ position: { x: 700, y: 120 } });
  await page.keyboard.press("ControlOrMeta+V");
  await expect(page.getByText("These nodes come from the factorio pack", { exact: true })).toBeVisible();
  await expect(
    page.getByText("1 recipe doesn't exist in template and will show as missing.", { exact: true }),
  ).toBeVisible();
  await expect(ghostNodes(page)).toHaveCount(1);
});

test("copy and paste in a text field stay the field's own", async ({ page }) => {
  await openInApp(page, congested);
  await page.locator('.react-flow__node[data-id="gears"]').click();
  await page.keyboard.press("ControlOrMeta+F");
  const field = page.getByLabel("Find in factory");
  await field.fill("iron gear");
  await field.selectText();
  await page.keyboard.press("ControlOrMeta+C");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("iron gear");
  // Headless Chromium doesn't insert what it pastes; what matters is that the browser's paste goes ahead.
  await page.evaluate(() => {
    const pasted: boolean[] = [];
    Object.assign(window, { pasted });
    window.addEventListener("paste", (event) => pasted.push(event.defaultPrevented));
  });
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(() => page.evaluate(() => (window as unknown as { pasted: boolean[] }).pasted)).toEqual([false]);
  await expect(ghostNodes(page)).toHaveCount(0);
});
