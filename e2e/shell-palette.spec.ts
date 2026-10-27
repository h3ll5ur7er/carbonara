// The command palette, the app menu and the keyboard shortcuts, all read from the command registry.
// The `palette` scene has a template-pack document open behind a fake backend that records its edits.
import { expect, test, type Page } from "@playwright/test";

async function openScene(page: Page, colorScheme: "dark" | "light" = "dark") {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  await page.goto("/?scene=palette");
  await expect(page.getByRole("navigation", { name: "Documents" })).toContainText("Smelting line");
  await page.evaluate(() => document.fonts.ready);
}

const palette = (page: Page) => page.getByRole("dialog", { name: "Command palette" });

for (const colorScheme of ["dark", "light"] as const) {
  test(`the command palette in ${colorScheme}`, async ({ page }) => {
    await openScene(page, colorScheme);
    await page.keyboard.press("Control+K");
    await expect(palette(page)).toBeVisible();
    await expect(page).toHaveScreenshot(`palette-${colorScheme}.png`, { animations: "disabled" });
  });

  test(`quick-add results in ${colorScheme}`, async ({ page }) => {
    await openScene(page, colorScheme);
    await page.keyboard.press("Control+K");
    await page.keyboard.type("iron plate");
    await expect(page.getByRole("option", { name: /Iron Plate \(Coal Smelting\)/ })).toBeVisible();
    await expect(page).toHaveScreenshot(`palette-quick-add-${colorScheme}.png`, { animations: "disabled" });
  });
}

test("quick-add: typing an item and pressing Enter adds a node through the editing manager", async ({ page }) => {
  await openScene(page);
  await page.keyboard.press("Control+K");
  await page.keyboard.type("iron plate");
  await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option").first()).toContainText("Iron Plate");
  await page.keyboard.press("Enter");

  await expect(palette(page)).toBeHidden();
  await expect(page.getByText("Added Iron Plate", { exact: true })).toBeVisible();
  const edits = await page.evaluate(() => (window as unknown as { sceneEdits: unknown[] }).sceneEdits);
  expect(edits).toEqual([
    {
      documentId: "scene",
      label: "Add Iron Plate",
      commands: [
        {
          type: "addNode",
          graph: "root",
          // Named by the palette, so the keyboard focus can follow the node onto the canvas.
          id: expect.stringMatching(/^iron-plate-[0-9a-f]{6}$/),
          node: { kind: "recipe", recipe: "iron-plate" },
          // Where the user is looking: the middle of the visible canvas.
          position: { x: expect.any(Number), y: expect.any(Number) },
        },
      ],
    },
  ]);
});

test("quick-add finds a recipe by an item alias", async ({ page }) => {
  await openScene(page);
  await page.keyboard.press("Control+K");
  await page.keyboard.type("wire");
  await expect(page.getByRole("option").first()).toContainText("Copper Wire");
});

test("the palette runs commands and shows their shortcuts", async ({ page }) => {
  await openScene(page);
  await page.getByRole("button", { name: /Search or run a command/ }).click();
  await expect(page.getByRole("option", { name: /Toggle library/ })).toContainText("Ctrl");
  await page.keyboard.type("library");
  await page.keyboard.press("Enter");
  await expect(palette(page)).toBeHidden();
  await expect(page.getByRole("complementary", { name: "Library" })).toBeVisible();
});

test("Escape closes the palette and Ctrl+K toggles it", async ({ page }) => {
  await openScene(page);
  await page.keyboard.press("Control+K");
  await expect(palette(page)).toBeVisible();
  await page.keyboard.press("Control+K");
  await expect(palette(page)).toBeHidden();
  await page.keyboard.press("Control+K");
  await page.keyboard.press("Escape");
  await expect(palette(page)).toBeHidden();
});

test("an unmatched search says so", async ({ page }) => {
  await openScene(page);
  await page.keyboard.press("Control+K");
  // cmdk's fuzzy score accepts a letter repeated, so the search uses one that no command contains.
  await page.keyboard.type("qqqq");
  await expect(page.getByText("Nothing matches “qqqq”.")).toBeVisible();
});

test("shortcuts run commands", async ({ page }) => {
  await openScene(page);
  const library = page.getByRole("complementary", { name: "Library" });
  await page.keyboard.press("Control+B");
  await expect(library).toBeVisible();
  await page.keyboard.press("Control+I");
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeHidden();
  await page.keyboard.press("Control+Shift+L");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("the app menu lists every command with its shortcut", async ({ page }) => {
  await openScene(page);
  await page.getByRole("button", { name: "App menu" }).focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveText([
    /Command palette\s*Ctrl\s*K/,
    /New factory…\s*Ctrl\s*Shift\s*F/,
    /Open factory file…\s*Ctrl\s*O/,
    /Save factory file\s*Ctrl\s*S/,
    /Copy share link\s*Ctrl\s*Shift\s*E/,
    /Close factory\s*Ctrl\s*Shift\s*X/,
    /Rename factory…\s*F2/,
    /Export picture \(PNG\)/,
    /Export picture \(SVG\)/,
    /Toggle library\s*Ctrl\s*B/,
    /Toggle inspector\s*Ctrl\s*I/,
    /Switch light and dark theme\s*Ctrl\s*Shift\s*L/,
    /Zoom to fit\s*F/,
    /Zoom to selection\s*Shift\s*F/,
    /Show rates per second/,
    /Show rates per minute/,
    /Show rates per hour/,
    /Show rates in belts/,
    /Round machines to buildable/,
    /Bookmark this view\s*Shift\s*B/,
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((slot) => new RegExp(`Go to bookmark ${slot}\\s*${slot}`)),
    /Back\s*Ctrl\s*\[/,
    /Forward\s*Ctrl\s*\]/,
    /Toggle totals\s*T/,
    /Sankey overview\s*S/,
    /Bottleneck heatmap\s*H/,
    /Undo\s*Ctrl\s*Z/,
    /Redo\s*Ctrl\s*Shift\s*Z/,
    /Copy\s*Ctrl\s*C/,
    /Cut\s*Ctrl\s*X/,
    /Paste\s*Ctrl\s*V/,
    /Paste with connections\s*Ctrl\s*Shift\s*V/,
    /Duplicate\s*Ctrl\s*D/,
    /Find in factory\s*Ctrl\s*F/,
    /Delete selection\s*Del/,
    /Delete and bridge\s*Ctrl\s*Shift\s*Del/,
    /Add note\s*N/,
    /Arrange left to right\s*Shift\s*A/,
    /Arrange top to bottom/,
    /Align left edges/,
    /Align centres/,
    /Align right edges/,
    /Align top edges/,
    /Align middles/,
    /Align bottom edges/,
    /Distribute horizontally/,
    /Distribute vertically/,
    /Straighten chain\s*Shift\s*S/,
    /Lock or unlock selection\s*Shift\s*L/,
    /Frame selection\s*Shift\s*G/,
    /Collapse or expand frame/,
    /Tag red/,
    /Tag orange/,
    /Tag yellow/,
    /Tag green/,
    /Tag blue/,
    /Tag purple/,
    /Remove tag/,
    /Collapse into subgraph\s*Ctrl\s*G/,
    /Expand subgraph\s*Ctrl\s*Shift\s*G/,
    /Open subgraph\s*Ctrl\s*↓/,
    /Leave subgraph\s*Ctrl\s*↑/,
    /Plan production…\s*P/,
    /AI access and activity…\s*Ctrl\s*Shift\s*A/,
    /Keyboard shortcuts\s*\?/,
    /Take the tour/,
  ]);
  // Typeahead moves to the item, wherever new commands put it.
  await page.keyboard.type("Toggle i");
  await expect(menu.getByRole("menuitem", { name: /Toggle inspector/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeHidden();
});
