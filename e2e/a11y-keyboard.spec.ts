// The core flows with the keyboard alone (CARB-66): no mouse event reaches the page in these tests. Focus moves
// with Tab and Shift+Tab (`tabTo`), and every step checks where the focus is, so a step that drops the focus on
// the page's body fails here before it fails a person. The keyboard map is in docs/Design.md, Accessibility.
import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/** A recipe node, by the name it has for screen readers: "Copper Wire (Assembler)". */
const recipeNode = (page: Page, title: string) =>
  page.locator(`.react-flow__node-recipe[aria-label^="${title} ("]:not(.ghost)`);
const port = (owner: Locator, handle: string) => owner.locator(`.react-flow__handle[data-handleid="${handle}"]`);
const realNodes = (page: Page) => page.locator(".react-flow__node:not(.ghost):not(.ghost-frame)");
const edges = (page: Page) => page.locator(".react-flow__edge:not(.ghost)");

/** Presses Tab (or Shift+Tab) until the element has the focus; fails if it never gets it. */
async function tabTo(page: Page, target: Locator, { backwards = false, limit = 80 } = {}) {
  for (let presses = 0; presses < limit; presses++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(backwards ? "Shift+Tab" : "Tab");
  }
  await expect(target).toBeFocused();
}

/** The focus is somewhere on purpose, not dropped on the page's body. */
async function expectFocusKept(page: Page) {
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName ?? "none")).not.toBe("BODY");
}

async function quickAdd(page: Page, query: string, title: string) {
  await page.keyboard.press("ControlOrMeta+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await page.keyboard.type(query);
  await expect(palette.getByRole("option", { name: new RegExp(title) }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
  // The new node has the focus, so its ports are a Tab away.
  await expect(recipeNode(page, title)).toBeFocused();
}

/** Starts a connection on one port and ends it on another, with Enter on each. */
async function connectWithKeys(page: Page, from: Locator, to: Locator, backwards = false) {
  await tabTo(page, from, { backwards });
  await page.keyboard.press("Enter");
  await expect(from).toHaveClass(/clickconnecting/);
  await tabTo(page, to, { backwards });
  await page.keyboard.press("Enter");
}

// Long flows through the live app (worker, solver): more time than one step of a shorter spec.
test.describe.configure({ timeout: 90_000 });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  // The first load on a fresh dev server compiles the app: slower than a step.
  await expect(page.getByText("Plan your next factory")).toBeVisible({ timeout: 20_000 });
});

test("builds, connects, targets and plans a factory with the keyboard alone", async ({ page }) => {
  // Create a factory: the dialog opens with its name field focused, and closing it leaves the focus on the page.
  await page.keyboard.press("ControlOrMeta+Shift+F");
  const dialog = page.getByRole("dialog", { name: "New factory" });
  await expect(dialog.getByLabel("Name")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Keyboard works");
  await page.keyboard.press("Enter");
  // Creating waits for the backend worker, which a busy machine slows down.
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole("tab", { name: "Keyboard works", selected: true })).toBeVisible();

  // Add two recipes through the palette.
  await quickAdd(page, "copper plate", "Copper Plate");
  await quickAdd(page, "copper wire", "Copper Wire");
  const plates = recipeNode(page, "Copper Plate");
  const wire = recipeNode(page, "Copper Wire");

  // Connect the plates to the wire machine: Enter on the output, then Enter on the input.
  await connectWithKeys(page, port(plates, "out:copper-plate"), port(wire, "in:copper-plate"), true);
  await expect(edges(page)).toHaveCount(1);
  await expect(page.locator("[id^=react-flow__aria-live]")).toContainText(/Connected/);

  // Escape lets go of a connection that was started.
  await tabTo(page, port(wire, "out:copper-wire"));
  await page.keyboard.press("Enter");
  await expect(port(wire, "out:copper-wire")).toHaveClass(/clickconnecting/);
  await page.keyboard.press("Escape");
  await expect(port(wire, "out:copper-wire")).not.toHaveClass(/clickconnecting/);

  // Enter twice on a port opens the picker of what to connect there: an output for the wire.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const picker = page.getByRole("dialog", { name: "Connect a consumer" });
  await expect(picker).toBeVisible();
  await page.keyboard.type("output");
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await expect(edges(page)).toHaveCount(2);
  const output = page.locator(".react-flow__node-sink");
  await expect(output).toHaveCount(1);
  await expectFocusKept(page);

  // Set a target on the output in the inspector: Enter selects the focused node.
  await tabTo(page, output);
  await page.keyboard.press("Enter");
  await expect(output).toHaveClass(/selected/);
  const target = page.getByRole("complementary", { name: "Inspector" }).getByLabel("Target");
  await tabTo(page, target);
  await page.keyboard.type("2");
  await page.keyboard.press("Enter");
  await expect(output).toContainText("100% of 2/s");

  // Plan with P (once the focus has left the text field) and accept with Enter.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("p");
  const planner = page.getByRole("region", { name: "Plan production" });
  await expect(planner.getByLabel("Goal 1 item")).toBeFocused();
  await page.keyboard.type("iron gear");
  await page.keyboard.press("Enter");
  await expect(planner.getByLabel("Goal 1 item")).toHaveValue("Iron Gear");
  await tabTo(page, planner.getByLabel("Goal 1 rate"));
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("1");
  await page.keyboard.press("Enter");
  await tabTo(page, planner.getByRole("button", { name: "Plan", exact: true }));
  await page.keyboard.press("Enter");
  await expect(planner.getByRole("button", { name: "Accept" })).toBeFocused();
  const before = await realNodes(page).count();
  await page.keyboard.press("Enter");
  await expect(planner).toContainText("Added to Keyboard works");
  expect(await realNodes(page).count()).toBeGreaterThan(before);
  await tabTo(page, planner.getByRole("button", { name: "Done" }));
  await page.keyboard.press("Enter");
  await expect(planner).toBeHidden();
  await expectFocusKept(page);

  // Undo takes the plan back in one step.
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(realNodes(page)).toHaveCount(before);
});

test("copies, pastes with the keyboard ghost, collapses and enters a subgraph, and undoes", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+Shift+F");
  await expect(page.getByRole("dialog", { name: "New factory" }).getByLabel("Name")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Subgraphs by keys");
  await page.keyboard.press("Enter");
  await quickAdd(page, "copper plate", "Copper Plate");
  await quickAdd(page, "copper wire", "Copper Wire");
  const plates = recipeNode(page, "Copper Plate");
  const wire = recipeNode(page, "Copper Wire");
  await connectWithKeys(page, port(plates, "out:copper-plate"), port(wire, "in:copper-plate"), true);
  await expect(edges(page)).toHaveCount(1);

  // Select both: Enter on one, Shift+Enter on the other.
  await tabTo(page, plates, { backwards: true });
  await page.keyboard.press("Enter");
  await tabTo(page, wire);
  await page.keyboard.press("Shift+Enter");
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);

  // Copy, paste: the ghost waits mid-view; arrows move it a grid step, Enter places it.
  await page.keyboard.press("ControlOrMeta+C");
  await page.keyboard.press("ControlOrMeta+V");
  const ghostFrame = page.locator(".react-flow__node.ghost-frame");
  await expect(ghostFrame).toBeVisible();
  const start = await ghostFrame.boundingBox();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(async () => ((await ghostFrame.boundingBox())?.y ?? 0) - (start?.y ?? 0)).toBeGreaterThan(40);
  await page.keyboard.press("Enter");
  await expect(ghostFrame).toHaveCount(0);
  await expect(realNodes(page)).toHaveCount(4);
  await expect(edges(page)).toHaveCount(2);
  await expectFocusKept(page);

  // Collapse the pasted copy (selected after placing) into a subgraph, enter it and leave it.
  await page.keyboard.press("ControlOrMeta+G");
  const instance = page.locator(".react-flow__node-instance");
  await expect(instance).toHaveCount(1);
  await expect(instance).toHaveClass(/selected/);
  await page.keyboard.press("ControlOrMeta+ArrowDown");
  const breadcrumbs = page.getByRole("navigation", { name: "Subgraph" });
  await expect(breadcrumbs).toBeVisible();
  await expectFocusKept(page);
  await page.keyboard.press("ControlOrMeta+ArrowUp");
  await expect(breadcrumbs).toBeHidden();
  await expect(instance).toBeFocused();

  // Undo takes back the collapse, then the paste.
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(instance).toHaveCount(0);
  await expect(realNodes(page)).toHaveCount(4);
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(realNodes(page)).toHaveCount(2);

  // Delete on a focused tab closes its factory; the focus moves on rather than dropping.
  const tab = page.getByRole("tab", { name: "Subgraphs by keys" });
  await tabTo(page, tab, { backwards: true, limit: 120 });
  await page.keyboard.press("Delete");
  await expect(tab).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New factory" }).first()).toBeFocused();
});
