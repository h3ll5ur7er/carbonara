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
  await instances(page).locator("header").dblclick();
  await expect(breadcrumbs(page)).toContainText("chain");
  await expect(breadcrumbs(page)).toContainText("Copper Wire line");
  await expect(page.locator(".react-flow__node-port")).toHaveCount(3);
  await expect(page.locator('[data-id="wire"]')).toContainText("Copper Wire");

  // Edit inside: without its wire machine, the line makes no more wire.
  await page.locator('[data-id="wire"] header').click();
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
  await page.keyboard.press("ControlOrMeta+B");
  const library = page.getByRole("complementary", { name: "Library" });
  const card = library.getByRole("button", { name: /Copper Wire line/ });
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
  await page.keyboard.press("ControlOrMeta+B");
  const card = page.getByRole("complementary", { name: "Library" }).getByRole("button", { name: /Copper Wire line/ });
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

for (const colorScheme of ["dark", "light"] as const) {
  test(`instance cards and the blueprint library in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/?scene=subgraph");
    await expect(page.locator('[data-scene="subgraph"]')).toBeAttached();
    await page.evaluate(() => window.document.fonts.ready);
    await breadcrumbs(page).getByRole("button", { name: "Wire works" }).click();
    await expect(instances(page)).toHaveCount(2);
    await page.keyboard.press("ControlOrMeta+B");
    await expect(page.getByRole("complementary", { name: "Library" })).toContainText("Copper Wire line");
    await expect(page).toHaveScreenshot(`instances-library-${colorScheme}.png`, { animations: "disabled" });
  });
}
