// Notes, frames, colour tags, viewport bookmarks and back/forward (docs/Design/Editor-quality-of-life.md,
// Organising and navigating).
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

function zoom(page: Page) {
  return page
    .locator(".react-flow__viewport")
    .evaluate((viewport) => new DOMMatrix(getComputedStyle(viewport).transform).a);
}

test("N adds a note, and double-clicking it edits its text in place", async ({ page }) => {
  await openScene(page, "congested&zoom=1&focus=plate-merge");
  await page.locator(".react-flow__pane").click({ position: { x: 300, y: 600 } });
  await page.keyboard.press("n");
  const note = page.locator(".react-flow__node-note");
  await expect(note).toHaveCount(1);
  await expect(note).toContainText("Note");

  await note.dblclick();
  const text = page.getByRole("textbox", { name: "Note text" });
  await expect(text).toBeFocused();
  await page.keyboard.type("Merge the two plate lines here");
  await page.keyboard.press("Control+Enter");
  await expect(note).toContainText("Merge the two plate lines here");
  const commands = await appliedCommands(page);
  expect(commands[0]).toMatchObject({ type: "addNode", node: { kind: "note", text: "Note" } });
  expect(commands[1]).toMatchObject({ type: "setText", text: "Merge the two plate lines here" });
});

test("Escape drops an edit in place", async ({ page }) => {
  await openScene(page, "chain&zoom=1&focus=note");
  await page.locator(".react-flow__node-note").dblclick();
  await page.keyboard.type("Never mind");
  await page.keyboard.press("Escape");
  await expect(page.locator(".react-flow__node-note")).not.toContainText("Never mind");
  expect(await appliedCommands(page)).toEqual([]);
});

for (const colorScheme of ["dark", "light"] as const) {
  test(`frames and colour tags for a selection, in ${colorScheme}`, async ({ page }) => {
    await openScene(page, "congested&zoom=0.8&focus=wash-a", colorScheme);
    await page.locator('[data-id="wash-a"]').click();
    await page.locator('[data-id="smelt-a"]').click({ modifiers: ["Shift"] });
    await page.keyboard.press("Shift+G");
    const toolbar = page.getByRole("toolbar", { name: "Selection" });
    await toolbar.getByRole("button", { name: "Tag" }).click();
    await page.getByRole("menuitem", { name: "Blue" }).click();
    await expect(page.getByRole("img", { name: "Tagged blue" })).toHaveCount(2);

    const [frame, tag] = await appliedCommands(page);
    // A grid step around both cards, two above for the label.
    expect(frame).toMatchObject({
      type: "addNode",
      node: { kind: "frame", label: "Frame" },
      position: { x: 480, y: -48, width: 768 },
    });
    expect(tag).toMatchObject({ type: "setTag", ids: ["wash-a", "smelt-a"], tag: "blue" });

    await page.locator(".react-flow__pane").click({ position: { x: 700, y: 820 } });
    await page.locator(".react-flow__node-frame span", { hasText: "Frame" }).dblclick();
    await page.keyboard.type("Line A");
    await page.keyboard.press("Enter");
    await expect(page.locator(".react-flow__node-frame")).toContainText("Line A");
    await expect(page).toHaveScreenshot(`frame-and-tags-${colorScheme}.png`);
  });
}

for (const colorScheme of ["dark", "light"] as const) {
  test(`a frame collapses to its label bar, its flows meeting at the bar, in ${colorScheme}`, async ({ page }) => {
    await openScene(page, "chain&zoom=0.6&focus=wire", colorScheme);
    const copper = page.locator('.react-flow__node[data-id="copper-frame"]');
    await copper.hover({ position: { x: 300, y: 200 } });
    await page.getByRole("button", { name: "Collapse frame Copper" }).click();

    // What it holds is hidden; the flows that leave it start at the bar.
    for (const id of ["cuprite-ore", "smelt-copper", "wire", "slag", "wire-split"]) {
      await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toBeHidden();
    }
    await expect(copper).toContainText("5 nodes");
    await expect(page.locator('[aria-label="Edge from copper-frame to circuits"]')).toHaveCount(1);
    await page.mouse.move(10, 10);
    await expect(page).toHaveScreenshot(`frame-collapsed-${colorScheme}.png`);

    await page.getByRole("button", { name: "Expand frame Copper" }).click();
    await expect(page.locator('.react-flow__node[data-id="wire"]')).toBeVisible();
    expect(await appliedCommands(page)).toEqual([
      expect.objectContaining({ type: "setCollapsed", ids: ["copper-frame"], collapsed: true }),
      expect.objectContaining({ type: "setCollapsed", ids: ["copper-frame"], collapsed: false }),
    ]);
  });
}

test("dragging a collapsed frame takes what it holds along", async ({ page }) => {
  await openScene(page, "chain&zoom=0.6&focus=wire");
  await page.locator('.react-flow__node[data-id="copper-frame"]').click({ position: { x: 300, y: 200 } });
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("collapse");
  await page.getByRole("option", { name: /Collapse or expand frame/ }).click();
  const bar = page.locator('.react-flow__node[data-id="copper-frame"]');
  await expect(bar).toContainText("5 nodes");

  const box = await bar.boundingBox();
  if (!box) throw new Error("no bar");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 120, { steps: 8 });
  await page.mouse.up();
  const moves = (await appliedCommands(page)).filter((command) => command.type === "moveNodes");
  const moved = moves.at(-1);
  if (moved?.type !== "moveNodes") throw new Error("no move");
  // The frame and the five nodes it holds, by the same amount.
  expect(Object.keys(moved.positions).sort()).toEqual(
    ["copper-frame", "cuprite-ore", "slag", "smelt-copper", "wire", "wire-split"].sort(),
  );
  const shift = (id: string, x: number, y: number) => {
    const at = moved.positions[id];
    return at && { x: at.x - x, y: at.y - y };
  };
  expect(shift("wire", 768, 556)).toEqual(shift("copper-frame", -24, 528));
});

test("bookmarks, and back and forward through the places you looked at", async ({ page }) => {
  await openScene(page, "chain&zoom=1.5&focus=gears");
  await page.keyboard.press("Shift+B");
  await expect(page.getByText("Saved as bookmark 1", { exact: true })).toBeVisible();
  await page.keyboard.press("f");
  await expect.poll(() => zoom(page)).toBeLessThan(0.8);

  await page.keyboard.press("1");
  await expect.poll(() => zoom(page)).toBeCloseTo(1.5);
  await page.keyboard.press("Control+[");
  await expect.poll(() => zoom(page)).toBeLessThan(0.8);
  await page.keyboard.press("Control+]");
  await expect.poll(() => zoom(page)).toBeCloseTo(1.5);
});
