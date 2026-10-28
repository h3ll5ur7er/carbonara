// The recipe browser in the library (CARB-134, CARB-135, CARB-136): browsing and finding recipes, adding them by
// click, drag and keyboard, favourites and recents that survive a reload, and suggestions that connect themselves;
// in the live app on the template pack. Then the `recipe-browser` scene as it looks.
import { expect, test, type Locator, type Page } from "@playwright/test";

async function newFactory(page: Page, name: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "New factory" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New factory" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
  return page.getByRole("complementary", { name: "Library" });
}

/** The tree's rows by name: groups as "▸ Name", recipes by their name. */
async function rowNames(library: Locator): Promise<string[]> {
  return library.getByRole("treeitem").evaluateAll((items) =>
    items.map((item) => {
      const name = (item.getAttribute("aria-label") ?? "").split(",")[0] ?? "";
      return item.hasAttribute("aria-expanded") ? `▸ ${name}` : name;
    }),
  );
}

const recipeNodes = (page: Page) => page.locator(".react-flow__node-recipe:not(.ghost)");

test("browses every recipe by machine, category and unlock, and finds one by what it makes or takes", async ({
  page,
}) => {
  const library = await newFactory(page, "Browsing");
  // A small pack: every group open, the pack's buildings in order; recycling left out.
  await expect(library.getByRole("treeitem", { name: /^Furnace/ })).toHaveAttribute("aria-expanded", "true");
  expect((await rowNames(library)).filter((name) => name.startsWith("▸"))).toEqual([
    "▸ Furnace",
    "▸ Assembler",
    "▸ Ore Washer",
    "▸ Water Purifier",
    "▸ Mixer",
  ]);
  await expect(library.getByRole("treeitem", { name: /Motor Recycling/ })).toHaveCount(0);

  await library.getByRole("tab", { name: "Category" }).click();
  await expect(library.getByRole("treeitem", { name: "Water treatment, Materials, 2 recipes" })).toBeVisible();
  await library.getByRole("tab", { name: "Unlock" }).click();
  expect((await rowNames(library)).filter((name) => name.startsWith("▸"))).toEqual([
    "▸ From the start",
    "▸ Ore washing",
    "▸ Electronics",
    "▸ Motors",
    "▸ Waste reuse",
  ]);

  // Closing a group hides its recipes.
  await library
    .getByRole("treeitem", { name: /^Ore washing/ })
    .getByText("Ore washing")
    .click();
  await expect(library.getByRole("treeitem", { name: /^Washed Ferrite/ })).toHaveCount(0);

  // Typing lists what matches, makers before users; recycling only when asked.
  await library.getByRole("searchbox", { name: "Search recipes" }).fill("slag");
  expect(await rowNames(library)).toEqual(["Copper Plate", "Concrete"]);
  await library.getByRole("searchbox", { name: "Search recipes" }).fill("motor");
  expect(await rowNames(library)).toEqual(["Motor"]);
  await library.getByRole("button", { name: "Filter recipes" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Recycling" }).click();
  await page.keyboard.press("Escape");
  expect(await rowNames(library)).toEqual(["Motor", "Motor Recycling"]);
});

test("adds a recipe by a click, a drag and the keyboard, and selects it", async ({ page }) => {
  const library = await newFactory(page, "Adding");

  // A click: mid-view, selected, in the inspector.
  await library.getByRole("treeitem", { name: /^Copper Wire/ }).click();
  await expect(recipeNodes(page)).toHaveCount(1);
  await expect(recipeNodes(page).first()).toHaveClass(/selected/);
  await expect(
    page.getByRole("complementary", { name: "Inspector" }).getByRole("heading", { name: "Copper Wire" }),
  ).toBeVisible();

  // A drag: the recipe follows the pointer as a ghost and lands where it's let go.
  const gear = await library.getByRole("treeitem", { name: /^Iron Gear/ }).boundingBox();
  if (!gear) throw new Error("no row");
  await page.mouse.move(gear.x + 80, gear.y + gear.height / 2);
  await page.mouse.down();
  await page.mouse.move(700, 760, { steps: 12 });
  await expect(page.locator(".react-flow__node.ghost")).toContainText("Iron Gear");
  await page.mouse.up();
  await expect(recipeNodes(page)).toHaveCount(2);
  await expect(page.locator(".react-flow__node.ghost")).toHaveCount(0);
  const placed = page.locator('.react-flow__node-recipe[data-id^="iron-gear-"]');
  await expect(placed).toHaveClass(/selected/);
  const box = await placed.boundingBox();
  // Centred on where it was let go, give or take the grid.
  expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - 700)).toBeLessThan(40);
  expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) / 2 - 760)).toBeLessThan(40);

  // The keyboard: R to search, ↓ into the list, Enter adds; the focus moves to the new node.
  await page.keyboard.press("Escape");
  await page.keyboard.press("r");
  await expect(library.getByRole("searchbox", { name: "Search recipes" })).toBeFocused();
  await page.keyboard.type("motor");
  await page.keyboard.press("ArrowDown");
  await expect(library.getByRole("treeitem", { name: /^Motor/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(recipeNodes(page)).toHaveCount(3);
  await expect(page.locator('.react-flow__node-recipe[data-id^="motor-"]')).toBeFocused();

  // One undo takes the last one back.
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(recipeNodes(page)).toHaveCount(2);
});

test("favourites and recent recipes survive a reload, and come first in quick-add", async ({ page }) => {
  const library = await newFactory(page, "Favourites");
  const motor = library.getByRole("treeitem", { name: /^Motor/ });
  await motor.hover();
  await motor.getByRole("button", { name: "Add Motor to favourites" }).click();
  await expect(library.getByRole("treeitem", { name: "Favourites, 1 recipe" })).toBeVisible();
  // From the keyboard too: F stars the row with the focus.
  await library.getByRole("treeitem", { name: /^Concrete/ }).focus();
  await page.keyboard.press("f");
  await expect(library.getByRole("treeitem", { name: "Favourites, 2 recipes" })).toBeVisible();

  await library
    .getByRole("treeitem", { name: /^Circuit/ })
    .last()
    .click();
  await library
    .getByRole("treeitem", { name: /^Copper Wire/ })
    .last()
    .click();
  await expect(recipeNodes(page)).toHaveCount(2);
  await expect(library.getByRole("treeitem", { name: "Recent, 2 recipes" })).toBeVisible();

  await page.reload();
  await expect(library.getByRole("treeitem", { name: "Favourites, 2 recipes" })).toBeVisible({ timeout: 15_000 });
  const rows = await rowNames(library);
  expect(rows.slice(0, rows.indexOf("▸ Recent") + 3)).toEqual([
    "▸ Favourites",
    "Motor",
    "Concrete",
    "▸ Recent",
    "Copper Wire",
    "Circuit",
  ]);

  // Quick-add offers them before anything is typed, favourites first.
  await page.keyboard.press("ControlOrMeta+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette.getByRole("option").first()).toContainText("Motor");
  await expect(palette).toContainText("Recent recipes");
  await page.keyboard.press("Escape");

  // Unstarring takes a recipe out of Favourites.
  await library
    .getByRole("treeitem", { name: /^Motor/ })
    .first()
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Remove from favourites" }).click();
  await expect(library.getByRole("treeitem", { name: "Favourites, 1 recipe" })).toBeVisible();
});

test("suggests what the factory needs next, and a suggestion added connects itself", async ({ page }) => {
  const library = await newFactory(page, "Suggestions");
  await library.getByRole("treeitem", { name: /^Circuit/ }).click();
  await expect(recipeNodes(page)).toHaveCount(1);
  // The new circuit assembler is selected: its open ports want iron plate and copper wire, and a use for circuits.
  const suggested = library.getByRole("treeitem", { name: /^Suggested/ });
  await expect(suggested).toBeVisible();
  const plate = library.getByRole("treeitem", { name: /^Iron Plate, Furnace/ }).first();
  await expect(plate).toContainText("Makes Iron Plate for Circuit");
  await plate.click();
  await expect(recipeNodes(page)).toHaveCount(2);
  // Added beside the circuit assembler's input, and connected to it, in one step.
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(recipeNodes(page)).toHaveCount(1);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
});

for (const colorScheme of ["dark", "light"] as const) {
  test(`the recipe browser in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/?scene=recipe-browser");
    const library = page.getByRole("complementary", { name: "Library" });
    await expect(library.getByRole("treeitem", { name: /^Suggested/ })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`recipe-browser-${colorScheme}.png`, { animations: "disabled" });
  });
}

test("the recipe browser searching and grouped by unlock, in dark", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/?scene=recipe-browser");
  const library = page.getByRole("complementary", { name: "Library" });
  await library.getByRole("tab", { name: "Unlock" }).click();
  await expect(library.getByRole("treeitem", { name: /^From the start/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("recipe-browser-unlock-dark.png", { animations: "disabled" });
  await library.getByRole("searchbox", { name: "Search recipes" }).fill("plate");
  await expect(library.getByRole("treeitem").first()).toBeVisible();
  await expect(page).toHaveScreenshot("recipe-browser-search-dark.png", { animations: "disabled" });
});
