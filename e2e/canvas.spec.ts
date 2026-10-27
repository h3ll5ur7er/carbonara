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

for (const colorScheme of ["dark", "light"] as const) {
  test(`the 20-node chain in ${colorScheme}`, async ({ page }) => {
    await openScene(page, "chain", colorScheme);
    await expect(page.locator(".react-flow__node")).toHaveCount(20);
    await expect(page).toHaveScreenshot(`chain-${colorScheme}.png`, { animations: "disabled" });
  });

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

for (const colorScheme of ["dark", "light"] as const) {
  test(`the congested graph in ${colorScheme}`, async ({ page }) => {
    // Particles stand still in screenshots: Playwright stops animations at their start.
    await openScene(page, "congested", colorScheme, "no-preference");
    await expect(page).toHaveScreenshot(`congested-${colorScheme}.png`, { animations: "disabled" });
  });
}

test("the congested graph with the colour-blind palette", async ({ page }) => {
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
