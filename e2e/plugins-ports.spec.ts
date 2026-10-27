// Ports follow the pack plugin's effective recipe: Factorio's stone furnace burns coal, which its recipe in the
// pack data doesn't name, and the canvas still gives it a coal port to connect.
import { expect as baseExpect, test, type Page } from "@playwright/test";

// Every step waits for a solve of the Factorio pack.
const expect = baseExpect.configure({ timeout: 15_000 });

async function newFactorioFactory(page: Page) {
  await page.getByRole("button", { name: "New factory" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New factory" });
  await dialog.getByLabel("Name").fill("Smelting");
  await dialog.getByRole("combobox", { name: "Game" }).click();
  await page.getByRole("option", { name: "Factorio" }).click();
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

test("a stone furnace has a port for the coal it burns, and a coal source connects to it", async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await newFactorioFactory(page);

  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("iron plate");
  await page
    .getByRole("option", { name: /^Iron plate/ })
    .first()
    .click();
  const furnace = page.locator(".react-flow__node").filter({ hasText: "Stone furnace" });
  await expect(furnace).toHaveCount(1);
  // The pack's recipe is iron ore → iron plate; the plugin adds the fuel.
  await expect(furnace.locator('[data-handleid="in:coal"]')).toBeAttached();
  await expect(furnace.getByRole("listitem")).toHaveText([/Iron ore/, /Coal/, /Iron plate/]);

  await dragFromPort(page, "in:coal", { x: -220, y: 60 });
  await page
    .getByRole("dialog", { name: "Connect a producer" })
    .getByRole("option", { name: /Coal source/ })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  // The flow reaches the furnace: nothing about it is a problem.
  await furnace.click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector.getByRole("combobox", { name: "Fuel" })).toBeVisible();
  await expect(inspector.getByRole("list", { name: "Problems" })).toBeHidden();

  // Burning wood instead, the furnace's coal port stays for the flow, marked as one it doesn't use.
  await inspector.getByRole("combobox", { name: "Fuel" }).click();
  await page.getByRole("option", { name: "wood", exact: true }).click();
  await expect(furnace.locator('[data-handleid="in:wood"]')).toBeAttached();
  await expect(furnace.getByRole("img", { name: "Not used" })).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(inspector.getByRole("list", { name: "Problems" })).toContainText("which this node doesn't use");
});
