// Subgraphs in the live app (docs/Architecture/Subgraphs.md, Interaction): a selection collapsed into a subgraph,
// opened, edited and left again with the factory re-solved; the blueprint library placing copies that share one
// blueprint; and the instance cards, breadcrumbs and library as they look.
import { expect, test, type Page } from "@playwright/test";
import { writeShareLink } from "../src/access/documents/share-links";
import { chain } from "../src/client/canvas/scenes/chain";
import { subgraphScene } from "../src/client/canvas/scenes/subgraph";
import type { Document } from "../src/contracts/document";
import type { PackData } from "../src/contracts/pack";
import { openInApp } from "./qol-helpers";

/** Results aren't needed: the live app solves the document itself. */
const NO_PACK: PackData = {
  units: { rate: "per_second" },
  items: [],
  buildings: [],
  recipes: [],
  logistics: [],
  resources: [],
  starters: [],
  categories: [],
  unlocks: [],
};

const breadcrumbs = (page: Page) => page.getByRole("navigation", { name: "Subgraph" });
/** Placed instances; a ghost on its way from the library is drawn with the same card. */
const instances = (page: Page) => page.locator(".react-flow__node-instance:not(.ghost)");
/** An instance card's row for an item: its rate is what crosses that port. */
const row = (page: Page, item: string) => instances(page).first().locator("li", { hasText: item });

async function openDocument(page: Page, document: Document) {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(`/#doc=${writeShareLink(document)}`);
  await expect(page.getByRole("tab", { name: document.name })).toBeVisible();
  await page.evaluate(() => window.document.fonts.ready);
}

test("collapses a selection, opens it, edits it and comes back with the factory re-solved", async ({ page }) => {
  await openInApp(page, chain);
  await page.locator('[data-id="smelt-copper"]').click();
  await page.locator('[data-id="wire"]').click({ modifiers: ["Shift"] });
  await page.keyboard.press("ControlOrMeta+g");

  // The copper line is one card now, selected, and the factory solves through it as before.
  await expect(page.locator('[data-id="smelt-copper"]')).toHaveCount(0);
  await expect(instances(page)).toHaveCount(1);
  await expect(instances(page)).toContainText("Copper Wire line");
  await expect(instances(page)).toHaveClass(/selected/);
  await page.keyboard.press("Shift+F");
  await expect(row(page, "Copper Wire")).toContainText("105");

  // Double-click dives in: the line's machines between its ports, the way back in the breadcrumbs.
  await instances(page).dblclick();
  await expect(breadcrumbs(page)).toContainText("chain");
  await expect(breadcrumbs(page)).toContainText("Copper Wire line");
  await expect(page.locator(".react-flow__node-port")).toHaveCount(3);
  await expect(page.locator('[data-id="wire"]')).toContainText("Copper Wire");

  // Edit inside: without its wire machine, the line makes no more wire.
  await page.locator('[data-id="wire"]').click();
  await page.keyboard.press("Delete");
  await expect(page.locator('[data-id="wire"]')).toHaveCount(0);

  // Back up: the instance and the factory around it follow the edit.
  await page.keyboard.press("ControlOrMeta+ArrowUp");
  await expect(breadcrumbs(page)).toBeHidden();
  await expect(instances(page)).toHaveCount(1);
  await expect(row(page, "Copper Wire")).not.toContainText("105");

  // One undo puts the wire machine back, and the wire flows again.
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(row(page, "Copper Wire")).toContainText("105");
});

test("places a blueprint from the library twice; editing the blueprint changes both", async ({ page }) => {
  const { document } = subgraphScene(NO_PACK);
  // Only the blueprint: the factory around it is placed from the library.
  await openDocument(page, { ...document, graph: { nodes: {}, edges: {} }, layout: { ...document.layout, root: {} } });
  const library = page.getByRole("complementary", { name: "Library" });
  await library.getByRole("tab", { name: /Blueprints/ }).click();
  const card = library.getByRole("button", { name: /^Copper Wire line/ });
  await expect(card).toContainText("Not placed");

  // Drag one onto the canvas: it follows as a ghost and lands where it's let go.
  const canvas = page.locator(".react-flow__pane");
  const area = await canvas.boundingBox();
  if (!area) throw new Error("no canvas");
  for (const [index, at] of [
    { x: area.x + area.width * 0.5, y: area.y + area.height * 0.3 },
    { x: area.x + area.width * 0.5, y: area.y + area.height * 0.7 },
  ].entries()) {
    const from = await card.boundingBox();
    if (!from) throw new Error("no card");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x, at.y, { steps: 10 });
    await expect(page.locator(".react-flow__node.ghost")).toHaveCount(1);
    await page.mouse.up();
    await expect(instances(page)).toHaveCount(index + 1);
  }
  await expect(page.locator(".react-flow__node.ghost")).toHaveCount(0);
  await expect(card).toContainText("Placed 2 times");
  for (const instance of await instances(page).all()) {
    await expect(instance.locator("li")).toHaveText([/Cuprite Ore/, /Copper Wire/, /Slag/]);
  }

  // Inside one of them, the blueprint loses its slag output: both copies lose it.
  await instances(page).first().getByRole("button", { name: "Open" }).click();
  await expect(breadcrumbs(page)).toContainText("2 instances");
  await page.locator('[data-id="out-slag"]').click();
  await page.keyboard.press("Delete");
  await breadcrumbs(page).getByRole("button", { name: document.name }).click();
  await expect(breadcrumbs(page)).toBeHidden();
  for (const instance of await instances(page).all()) {
    await expect(instance.locator("li")).toHaveText([/Cuprite Ore/, /Copper Wire/]);
  }
});

test("clicking a library card picks the blueprint up, a click on the canvas puts it down, Escape cancels", async ({
  page,
}) => {
  const { document } = subgraphScene(NO_PACK);
  await openDocument(page, document);
  await expect(instances(page)).toHaveCount(2);
  const library = page.getByRole("complementary", { name: "Library" });
  await library.getByRole("tab", { name: /Blueprints/ }).click();
  const card = library.getByRole("button", { name: /^Copper Wire line/ });
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  // Above the factory (fitting leaves room there): empty canvas.
  const area = await page.locator(".react-flow__pane").boundingBox();
  if (!area) throw new Error("no canvas");
  const empty = { x: area.x + area.width / 2, y: area.y + 24 };
  await page.mouse.move(empty.x, empty.y + 40, { steps: 5 });
  await page.mouse.move(empty.x, empty.y, { steps: 5 });
  await expect(page.locator(".react-flow__node.ghost")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".react-flow__node.ghost")).toHaveCount(0);
  await expect(card).toHaveAttribute("aria-pressed", "false");

  await card.click();
  await page.mouse.move(empty.x, empty.y + 40, { steps: 5 });
  await page.mouse.move(empty.x, empty.y, { steps: 5 });
  await page.mouse.click(empty.x, empty.y);
  await expect(instances(page)).toHaveCount(3);
  await expect(card).toContainText("Placed 3 times");
});

test("the library renames, duplicates and deletes blueprints, each one step undo takes back", async ({ page }) => {
  const { document } = subgraphScene(NO_PACK);
  await openDocument(page, document);
  const library = page.getByRole("complementary", { name: "Library" });
  await library.getByRole("tab", { name: /Blueprints/ }).click();
  const actions = (name: string) => library.getByRole("button", { name: `Actions for ${name}`, exact: true });

  // Right-click a card to rename the blueprint: every copy follows.
  await library.getByRole("button", { name: /^Copper Wire line/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  const name = library.getByRole("textbox", { name: "Blueprint name" });
  await name.fill("Wire module");
  await name.press("Enter");
  await expect(instances(page)).toHaveText([/Wire module/, /Wire module/]);

  // Its ⋯ button duplicates it: a variant nothing places yet.
  await actions("Wire module").click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(library.getByRole("button", { name: /^Wire module copy/ })).toContainText("Not placed");

  // Deleting the placed one asks first, and takes its instances with it.
  await actions("Wire module").click();
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete “Wire module”?" });
  await expect(dialog).toContainText("It's placed 2 times");
  await dialog.getByRole("button", { name: "Delete blueprint and 2 instances" }).click();
  await expect(instances(page)).toHaveCount(0);

  // The copy is placed nowhere: one click clears it away.
  await library.getByRole("button", { name: "Delete 1 unplaced blueprint" }).click();
  await expect(library).toContainText("No blueprints yet");

  // Each was one step.
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(library.getByRole("button", { name: /^Wire module copy/ })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(instances(page)).toHaveCount(2);
});

test("the inspector shows an instance's blueprint and ports, renames it, selects its copies and opens it", async ({
  page,
}) => {
  const { document } = subgraphScene(NO_PACK);
  await openDocument(page, document);
  await instances(page).first().click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector.getByRole("heading", { name: "Copper Wire line" })).toBeVisible();
  await expect(inspector).toContainText("placed 2 times");
  await expect(inspector.getByRole("region", { name: "Ports" }).getByRole("listitem")).toHaveText([
    /Cuprite Ore\s*In/,
    /Copper Wire\s*Out/,
    /Slag\s*Out/,
  ]);

  // Renaming the blueprint renames every copy, as one step.
  const name = inspector.getByRole("textbox", { name: "Name" });
  await name.fill("Wire module");
  await name.press("Enter");
  await expect(instances(page)).toHaveText([/Wire module/, /Wire module/]);

  await inspector.getByRole("button", { name: "Select all 2" }).click();
  for (const instance of await instances(page).all()) await expect(instance).toHaveClass(/selected/);

  // A click on empty canvas, then on one of them: it alone is selected.
  await page.locator(".react-flow__pane").click({ position: { x: 340, y: 24 } });
  await instances(page).first().click();
  await inspector.getByRole("button", { name: "Open" }).click();
  await expect(breadcrumbs(page)).toContainText("Wire module");
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(breadcrumbs(page)).toContainText("Copper Wire line");
});

test("the planner plans into the subgraph on screen", async ({ page }) => {
  const { document } = subgraphScene(NO_PACK);
  await openDocument(page, document);
  await instances(page).first().dblclick();
  await expect(breadcrumbs(page)).toContainText("Copper Wire line");

  await page.keyboard.press("p");
  const planner = page.getByRole("region", { name: "Plan production" });
  await planner.getByLabel("Goal 1 item").fill("iron gear");
  await page.keyboard.press("Enter");
  const rate = planner.getByLabel("Goal 1 rate");
  await rate.fill("1");
  await rate.press("Enter");
  await planner.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(page.locator(".react-flow__node.ghost").first()).toBeVisible();
  await planner.getByRole("button", { name: "Accept" }).click();

  // The gears are made inside the blueprint; the factory around has none.
  const gears = page.locator('.react-flow__node:not(.ghost)[data-id="iron-gear"]');
  await expect(gears).toHaveCount(1);
  await breadcrumbs(page).getByRole("button", { name: document.name }).click();
  await expect(breadcrumbs(page)).toBeHidden();
  await expect(instances(page)).toHaveCount(2);
  await expect(gears).toHaveCount(0);
});

test("find opens the way into a nested subgraph and back out", async ({ page }) => {
  const { document } = subgraphScene(NO_PACK);
  // The wire works become a hall of their own, placed once in the factory.
  const nested: Document = {
    ...document,
    graph: { nodes: { hall: { kind: "instance", blueprint: "works" } }, edges: {} },
    blueprints: { ...document.blueprints, works: { name: "Wire hall", graph: document.graph } },
    layout: { ...document.layout, works: document.layout.root ?? {}, root: { hall: { x: 0, y: 0 } } },
  };
  await openDocument(page, nested);
  await page.keyboard.press("ControlOrMeta+F");
  const find = page.getByRole("combobox", { name: "Find in factory" });
  await page.keyboard.type("wire assembler");
  await expect(page.getByRole("option")).toHaveText([/Copper Wire\s*Assembler · in Copper Wire line/]);

  // Enter opens the hall, then the copper line inside it, and selects the wire machine there.
  await page.keyboard.press("Enter");
  await expect(breadcrumbs(page).getByRole("listitem")).toHaveText([/Wire works/, /Wire hall/, /Copper Wire line/]);
  await expect(page.locator('.react-flow__node[data-id="wire"]')).toHaveClass(/selected/);
  await expect(find).toHaveValue("wire assembler");

  // A node of the factory itself: back up to it.
  await find.fill("wire hall");
  await page.keyboard.press("Enter");
  await expect(breadcrumbs(page)).toBeHidden();
  await expect(page.locator('.react-flow__node[data-id="hall"]')).toHaveClass(/selected/);
});

for (const colorScheme of ["dark", "light"] as const) {
  test(`instance cards and the blueprint library in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/?scene=subgraph");
    await expect(page.locator('[data-scene="subgraph"]')).toBeAttached();
    await page.evaluate(() => window.document.fonts.ready);
    await breadcrumbs(page).getByRole("button", { name: "Wire works" }).click();
    await expect(instances(page)).toHaveCount(2);
    const library = page.getByRole("complementary", { name: "Library" });
    await library.getByRole("tab", { name: /Blueprints/ }).click();
    await expect(library).toContainText("Copper Wire line");
    await expect(page).toHaveScreenshot(`instances-library-${colorScheme}.png`, { animations: "disabled" });
  });
}
