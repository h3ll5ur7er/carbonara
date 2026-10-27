// Pack plugins in the live app: Satisfactory's machine settings and power in the inspector, and the save profile.
import { expect as baseExpect, test, type Page } from "@playwright/test";

// Every step waits for a solve of the Satisfactory pack, which takes a while on a busy machine.
const expect = baseExpect.configure({ timeout: 15_000 });

async function newSatisfactoryFactory(page: Page) {
  await page.getByRole("button", { name: "New factory" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New factory" });
  await dialog.getByLabel("Name").fill("Plates");
  await dialog.getByRole("combobox", { name: "Game" }).click();
  await page.getByRole("option", { name: "Satisfactory" }).click();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
}

async function setNumber(page: Page, name: string, value: string) {
  const field = page.getByRole("complementary", { name: "Inspector" }).getByRole("spinbutton", { name });
  await field.fill(value);
  await field.press("Enter");
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await newSatisfactoryFactory(page);
});

test("the inspector shows a machine's clock speed, shards and somersloops, and its power", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("iron plate");
  await page
    .getByRole("option", { name: /^Iron Plate/ })
    .first()
    .click();
  const node = page.locator(".react-flow__node").first();
  await expect(node).toContainText("Iron Plate");
  await node.click();

  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector.getByRole("spinbutton", { name: "Clock speed" })).toHaveValue("100");
  await expect(inspector.getByRole("spinbutton", { name: "Power shards" })).toHaveValue("0");
  await expect(inspector.getByRole("spinbutton", { name: "Somersloops" })).toHaveValue("0");

  await setNumber(page, "Machines", "1");
  const metrics = inspector.getByRole("region", { name: "Metrics" });
  await expect(metrics).toContainText("Power use");
  await expect(metrics).toContainText("4 MW");

  // 250 % needs three power shards; until it has them the machine runs at 100 %.
  await setNumber(page, "Clock speed", "250");
  await expect(inspector.getByRole("list", { name: "Problems" })).toContainText(
    "Clock speed 250 % needs 3 power shards; running at 100 %",
  );
  await setNumber(page, "Power shards", "3");
  await expect(inspector.getByRole("list", { name: "Problems" })).toBeHidden();
  await expect(metrics).toContainText("13.43 MW");
  await expect(node).toContainText("50/min");
});

test("the save profile unlocks and locks alternate recipes", async ({ page }) => {
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector.getByRole("heading", { name: "Save profile" })).toBeVisible();
  await expect(inspector).toContainText("110 of 110 unlocked");
  await expect(inspector.getByRole("switch", { name: "Limit somersloops" })).toBeVisible();

  await inspector.getByRole("searchbox", { name: "Filter alternates" }).fill("pure iron");
  const pure = inspector.getByRole("checkbox", { name: "Pure Iron Ingot" });
  await pure.uncheck();
  await expect(pure).not.toBeChecked();
  await expect(inspector).toContainText("109 of 110 unlocked");

  await inspector.getByRole("button", { name: "Lock all", exact: true }).click();
  await expect(inspector).toContainText("0 of 110 unlocked");
  await inspector.getByRole("button", { name: "Unlock all" }).click();
  await expect(inspector).toContainText("110 of 110 unlocked");
});
