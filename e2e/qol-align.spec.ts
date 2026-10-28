// Aligning, distributing and straightening the selection (docs/Design/Editor-quality-of-life.md, Layout and
// alignment), from the selection toolbar, the palette and the keyboard.
import { expect, test, type Page } from "@playwright/test";

async function openScene(page: Page, query: string, colorScheme: "dark" | "light" = "dark") {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  await page.goto(`/?scene=${query}`);
  await expect(page.locator(".react-flow__node").first()).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
}

function appliedCommands(page: Page) {
  return page.evaluate(() => window.carbonaraScene?.commands ?? []);
}

async function select(page: Page, ids: string[]) {
  for (const [index, id] of ids.entries()) {
    await page.locator(`[data-id="${id}"]`).click({ modifiers: index === 0 ? [] : ["Shift"] });
  }
  // Each click is handled after React Flow's next render; a shortcut pressed before the last one lands acts on less.
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(ids.length);
}

for (const colorScheme of ["dark", "light"] as const) {
  test(`the selection toolbar appears for several nodes, in ${colorScheme}`, async ({ page }) => {
    await openScene(page, "congested&zoom=0.8&focus=smelt-a", colorScheme);
    await select(page, ["wash-a"]);
    await expect(page.getByRole("toolbar", { name: "Selection" })).toHaveCount(0);
    await select(page, ["wash-a", "smelt-b"]);
    const toolbar = page.getByRole("toolbar", { name: "Selection" });
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toHaveScreenshot(`selection-toolbar-${colorScheme}.png`);
  });
}

test("aligning from the toolbar lines the nodes up in one edit", async ({ page }) => {
  await openScene(page, "congested&zoom=0.8&focus=smelt-a");
  await select(page, ["wash-a", "smelt-b"]);
  await page.getByRole("toolbar", { name: "Selection" }).getByRole("button", { name: "Align top edges" }).click();
  await expect
    .poll(() => appliedCommands(page))
    .toEqual([expect.objectContaining({ type: "moveNodes", positions: { "smelt-b": { x: 912, y: 0 } } })]);
  await page.getByRole("toolbar", { name: "Selection" }).getByRole("button", { name: "Align left edges" }).click();
  await expect
    .poll(async () => (await appliedCommands(page))[1])
    .toMatchObject({
      type: "moveNodes",
      positions: { "smelt-b": { x: 504, y: 0 } },
    });
});

test("distributing from the palette spaces the nodes evenly", async ({ page }) => {
  await openScene(page, "congested&zoom=0.6&focus=smelt-a");
  // The ore split sits under the library.
  await page.keyboard.press("ControlOrMeta+B");
  await select(page, ["ore-split", "wash-b", "plate-merge"]);
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("distribute horizontally");
  await page.getByRole("option", { name: /Distribute horizontally/ }).click();
  // ore-split ends at 408 and plate-merge starts at 1320; the washer (312 wide) goes in the middle of the gap.
  await expect
    .poll(() => appliedCommands(page))
    .toEqual([expect.objectContaining({ type: "moveNodes", positions: { "wash-b": { x: 708, y: 336 } } })]);
});

test("Shift+S straightens a chain so its flows run level", async ({ page }) => {
  await openScene(page, "congested&zoom=0.6&focus=ore-split");
  await select(page, ["ore", "ore-split", "wash-a", "smelt-a"]);
  await page.keyboard.press("Shift+S");
  // The ore keeps its place and the splitter is level with it already; the washer's ore input comes down to the
  // splitter's output (252 + 24 - 108), and the smelter's input to the washer's clean ferrite (168 + 164 - 108).
  // The last edit, once it's applied: under load a click can land as a tiny drag, which is an edit of its own.
  await expect
    .poll(async () => (await appliedCommands(page)).at(-1))
    .toEqual(
      expect.objectContaining({
        type: "moveNodes",
        positions: { "wash-a": { x: 504, y: 168 }, "smelt-a": { x: 912, y: 224 } },
      }),
    );
});
