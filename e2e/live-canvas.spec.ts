// The live app's canvas: a new factory, a recipe quick-added from the palette, and the graph built from its ports.
import { expect, test, type Page } from "@playwright/test";

async function newFactory(page: Page, name: string) {
  await page.getByRole("button", { name: "New factory" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New factory" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
}

/** Drags a connection from a node's port and lets go `by` pixels away, over empty canvas. */
async function dragFromPort(page: Page, handle: string, by: { x: number; y: number }) {
  const box = await page.locator(`[data-handleid="${handle}"]`).first().boundingBox();
  if (!box) throw new Error(`port ${handle} not on screen`);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + by.x, start.y + by.y, { steps: 12 });
  await page.mouse.up();
}

test("builds a factory from the palette and the ports", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await newFactory(page, "Copper");
  await expect(page.getByText("This factory is empty")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("copper plate");
  await page.keyboard.press("Enter");
  const nodes = page.locator(".react-flow__node");
  await expect(nodes).toHaveCount(1);
  await expect(nodes.first()).toContainText("Copper Plate");
  await expect(page.getByText("This factory is empty")).toBeHidden();

  await dragFromPort(page, "in:cuprite-ore", { x: -220, y: 40 });
  const producers = page.getByRole("dialog", { name: "Connect a producer" });
  await expect(producers.getByRole("option")).toHaveText([/Cuprite Ore source/]);
  await page.keyboard.press("Enter");
  await expect(nodes).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  // Survives a reload: the edits went through the backend and were autosaved.
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
});

test("it flows: set a target and see the factory solve", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await newFactory(page, "Copper");
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("copper plate");
  await page.keyboard.press("Enter");
  await expect(page.locator(".react-flow__node")).toHaveCount(1);

  await dragFromPort(page, "in:cuprite-ore", { x: -220, y: 40 });
  await page
    .getByRole("dialog", { name: "Connect a producer" })
    .getByRole("option", { name: /source/ })
    .click();
  await dragFromPort(page, "out:copper-plate", { x: 160, y: 200 });
  const consumers = page.getByRole("dialog", { name: "Connect a consumer" });
  await consumers.getByRole("option", { name: /Copper Plate output/ }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  // With both side panels open the fit lands in compact cards, without rates (CARB-139): close the library.
  await page.keyboard.press("ControlOrMeta+B");
  // Zoom to fit: the whole factory, clear of the side panels.
  await page.keyboard.press("f");

  // Select the output and ask for one plate a second (Template Works counts per second).
  const output = page.locator('.react-flow__node[data-id^="sink-"]');
  await output.click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector).toContainText("Copper Plate");
  const target = inspector.getByLabel("Target");
  await target.fill("1");
  await target.press("Enter");

  // 3 s per plate: one a second takes 3 furnaces and 2 ore a second.
  await expect(output).toContainText("100% of 1/s");
  const furnace = page.locator(".react-flow__node").filter({ hasText: "Furnace" });
  await expect(furnace.getByRole("listitem").filter({ hasText: "Cuprite Ore" })).toContainText("2/s");
  await expect(furnace).toContainText("3 × 100%");
  await expect(inspector).toContainText("Set by you");

  // Undo history holds the edit: the target can be removed again.
  await inspector.getByRole("button", { name: "Remove target" }).click();
  await expect(inspector).toContainText("No target");
});
