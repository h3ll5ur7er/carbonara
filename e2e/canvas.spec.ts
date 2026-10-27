import { expect, test, type Page } from "@playwright/test";

/** Opens a fixture scene and waits until its nodes and fonts are on screen. */
async function openScene(
  page: Page,
  query: string,
  colorScheme: "dark" | "light" = "dark",
  reducedMotion: "reduce" | "no-preference" = "reduce",
) {
  await page.emulateMedia({ colorScheme, reducedMotion });
  await page.goto(`/?scene=${query}`);
  await expect(page.locator(".react-flow__node").first()).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
}

/** Commands the scene backend received through `editing.apply`. */
function appliedCommands(page: Page) {
  return page.evaluate(() => window.carbonaraScene?.commands ?? []);
}

// The whole `chain` and `congested` scenes are screenshot by e2e/scenes.spec.ts; these look closer.

test("the chain scene draws all of its 20 nodes", async ({ page }) => {
  await openScene(page, "chain");
  await expect(page.locator(".react-flow__node")).toHaveCount(20);
});

for (const colorScheme of ["dark", "light"] as const) {
  test(`node cards up close in ${colorScheme}`, async ({ page }) => {
    await openScene(page, "chain&zoom=1&focus=purify", colorScheme);
    await expect(page).toHaveScreenshot(`cards-${colorScheme}.png`, { animations: "disabled" });
  });
}

test("ports show the item and its live rate", async ({ page }) => {
  await openScene(page, "chain&zoom=1&focus=purify");
  const purifier = page.locator('[data-id="purify"]');
  await expect(purifier).toContainText("Water Purifier");
  await expect(purifier).toContainText("1 × 62.5%");
  await expect(purifier.getByRole("listitem").filter({ hasText: "Dirty Water" })).toContainText("37.5/min");
});

test("dropping a dragged node moves it through the editing manager", async ({ page }) => {
  await openScene(page, "chain&zoom=1&focus=purify");
  const header = page.locator('[data-id="purify"] header');
  const box = await header.boundingBox();
  if (!box) throw new Error("purifier not on screen");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => appliedCommands(page)).toHaveLength(1);
  const [command] = await appliedCommands(page);
  expect(command).toMatchObject({ type: "moveNodes", graph: "root", positions: { purify: {} } });
});

test("the congested graph with particles and the colour-blind palette", async ({ page }) => {
  // Particles stand still in screenshots: Playwright stops animations at their start.
  await openScene(page, "congested&zoom=1&focus=plate-merge", "dark", "no-preference");
  await page.evaluate(() => (document.documentElement.dataset.palette = "colorblind"));
  await expect(page).toHaveScreenshot("congested-colorblind.png", { animations: "disabled" });
});

test("flows are coloured by how full their belt is", async ({ page }) => {
  await openScene(page, "congested");
  const saturation = (edge: string) => page.locator(`[data-id="${edge}"] .flow`).getAttribute("data-saturation");
  expect(await saturation("ore-a")).toBe("healthy");
  expect(await saturation("ore-b")).toBe("near-capacity");
  expect(await saturation("plates-all")).toBe("over-capacity");
});

test("busier flows are drawn thicker", async ({ page }) => {
  await openScene(page, "congested");
  const width = (edge: string) =>
    page.locator(`[data-id="${edge}"] .flow-line`).evaluate((path) => parseFloat(getComputedStyle(path).strokeWidth));
  expect(await width("plates-all")).toBeGreaterThan(await width("ore-a"));
});

test("particles move along flows only while zoomed in and motion is welcome", async ({ page }) => {
  // A straight path has an empty bounding box, so ask for what the CSS decides rather than for visibility.
  const particles = () =>
    page.locator('[data-id="plates-all"] .flow-particles').evaluate((path) => ({
      display: getComputedStyle(path).display,
      animation: getComputedStyle(path).animationName,
    }));

  await openScene(page, "congested&zoom=1&focus=plate-merge", "dark", "no-preference");
  expect(await particles()).toEqual({ display: "inline", animation: "flow-particles" });

  await openScene(page, "congested&zoom=0.3&focus=plate-merge", "dark", "no-preference");
  expect((await particles()).display).toBe("none");

  await openScene(page, "congested&zoom=1&focus=plate-merge", "dark", "reduce");
  expect((await particles()).display).toBe("none");
});

const tiers = [
  { tier: "compact", zoom: 0.4 },
  { tier: "chip", zoom: 0.18 },
] as const;

for (const { tier, zoom } of tiers) {
  for (const colorScheme of ["dark", "light"] as const) {
    test(`${tier} level of detail in ${colorScheme}`, async ({ page }) => {
      await openScene(page, `chain&zoom=${zoom}&focus=purify`, colorScheme);
      await expect(page.locator(".react-flow")).toHaveClass(new RegExp(`\\blod-${tier}\\b`));
      await expect(page).toHaveScreenshot(`lod-${tier}-${colorScheme}.png`, { animations: "disabled" });
    });
  }
}

test("cards lose detail as the view zooms out, but keep their ports where they were", async ({ page }) => {
  const purifier = page.locator('[data-id="purify"]');
  const portOffset = () =>
    purifier.evaluate((node) => {
      const handle = node.querySelector('[data-handleid="in:dirty-water"]');
      if (!handle) throw new Error("no port");
      return (
        (handle.getBoundingClientRect().top - node.getBoundingClientRect().top) / node.getBoundingClientRect().height
      );
    });

  await openScene(page, "chain&zoom=1&focus=purify");
  await expect(purifier.getByRole("listitem")).toHaveCount(3);
  const fullOffset = await portOffset();

  await openScene(page, "chain&zoom=0.4&focus=purify");
  await expect(purifier.getByRole("listitem")).toHaveCount(0);
  await expect(purifier).toContainText("Water");
  expect(await portOffset()).toBeCloseTo(fullOffset, 2);
});

test("only nodes on screen are mounted while zoomed in", async ({ page }) => {
  await openScene(page, "perf&zoom=1&focus=wire-95");
  const mounted = await page.locator(".react-flow__node").count();
  expect(mounted).toBeGreaterThan(0);
  expect(mounted).toBeLessThan(100);
});

/** Drags a connection from a node's port and lets go `by` pixels away, over empty canvas. */
async function dragFromPort(page: Page, node: string, handle: string, by: { x: number; y: number }) {
  const box = await page.locator(`[data-id="${node}"] [data-handleid="${handle}"]`).boundingBox();
  if (!box) throw new Error(`port ${node}/${handle} not on screen`);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + by.x, start.y + by.y, { steps: 12 });
  await page.mouse.up();
}

test("dragging an output into empty space offers its consumers and connects the one picked", async ({ page }) => {
  await openScene(page, "chain&zoom=1&focus=gears");
  const edges = await page.locator(".react-flow__edge").count();
  await dragFromPort(page, "gears", "out:iron-gear", { x: 100, y: -220 });

  const picker = page.getByRole("dialog", { name: "Connect a consumer" });
  await expect(picker.getByRole("option")).toHaveText([/Motor/, /Iron Gear output/]);
  await expect(picker.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(picker).toBeHidden();
  const commands = await appliedCommands(page);
  expect(commands).toEqual([
    expect.objectContaining({ type: "addNode", node: { kind: "sink", item: "iron-gear" } }),
    expect.objectContaining({ type: "connect", edge: expect.objectContaining({ from: "gears", item: "iron-gear" }) }),
  ]);
  const added = commands[0]?.type === "addNode" ? commands[0].id : undefined;
  await expect(page.locator(`[data-id="${added}"]`)).toContainText("Iron Gear");
  await expect(page.locator(".react-flow__edge")).toHaveCount(edges + 1);
});

test("dragging an input offers its producers, typing narrows them, and Escape adds nothing", async ({ page }) => {
  await openScene(page, "chain&zoom=1&focus=gears");
  await dragFromPort(page, "gears", "in:iron-plate", { x: -140, y: -220 });

  const picker = page.getByRole("dialog", { name: "Connect a producer" });
  // The recipe the document already uses comes first, the alternate next, the source last.
  await expect(picker.getByRole("option")).toHaveText([/Iron Plate.*used 1×/, /Coal Smelting/, /Iron Plate source/]);
  await page.keyboard.type("coal");
  await expect(picker.getByRole("option")).toHaveText([/Coal Smelting/]);
  await page.keyboard.press("Escape");

  await expect(picker).toBeHidden();
  expect(await appliedCommands(page)).toEqual([]);
});

for (const colorScheme of ["dark", "light"] as const) {
  test(`the recipe picker in ${colorScheme}`, async ({ page }) => {
    await openScene(page, "chain&zoom=1&focus=gears", colorScheme);
    await dragFromPort(page, "gears", "in:iron-plate", { x: -140, y: -220 });
    await expect(page.getByRole("dialog", { name: "Connect a producer" })).toBeVisible();
    await expect(page).toHaveScreenshot(`picker-${colorScheme}.png`, { animations: "disabled" });
  });
}
