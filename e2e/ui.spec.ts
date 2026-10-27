// The design-system primitives in the gallery scene: how they look, and that each works from the keyboard.
import { expect, test, type Page } from "@playwright/test";

async function openGallery(page: Page, colorScheme: "dark" | "light" = "dark") {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  await page.goto("/?scene=gallery");
  await expect(page.getByRole("heading", { name: "Primitives" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

for (const colorScheme of ["dark", "light"] as const) {
  test(`the primitives gallery in ${colorScheme}`, async ({ page }) => {
    await openGallery(page, colorScheme);
    await expect(page).toHaveScreenshot(`gallery-${colorScheme}.png`, { animations: "disabled" });
  });

  test(`open overlays in ${colorScheme}`, async ({ page }) => {
    await openGallery(page, colorScheme);
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("menuitem", { name: "Copy" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Copy" }).hover();
    await expect(page).toHaveScreenshot(`gallery-menu-${colorScheme}.png`, { animations: "disabled" });
    await page.keyboard.press("Escape");

    await page.getByRole("combobox", { name: "Recipe" }).click();
    await expect(page.getByRole("option", { name: "Iron Gear" })).toBeVisible();
    await expect(page).toHaveScreenshot(`gallery-select-${colorScheme}.png`, { animations: "disabled" });
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Open dialog" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page).toHaveScreenshot(`gallery-dialog-${colorScheme}.png`, { animations: "disabled" });
  });
}

test("a pack accent recolours the accent tokens", async ({ page }) => {
  await openGallery(page);
  await page.getByRole("radio", { name: "Signal blue" }).click();
  await expect(page.getByRole("radio", { name: "Signal blue" })).toHaveAttribute("aria-checked", "true");
  await expect(page).toHaveScreenshot("gallery-accent-blue.png", { animations: "disabled" });
});

test.describe("keyboard", () => {
  test("buttons and toggles work with Enter and Space, and show their tooltip on focus", async ({ page }) => {
    await openGallery(page);
    const toggle = page.getByRole("button", { name: "Inspector panel" });
    await toggle.focus();
    await expect(page.getByRole("tooltip", { name: "Inspector panel" })).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  test("the number input steps with the arrow keys and commits typed values with Enter", async ({ page }) => {
    await openGallery(page);
    const machines = page.getByRole("spinbutton", { name: "Machines" });
    await machines.focus();
    await page.keyboard.press("ArrowUp");
    await expect(machines).toHaveValue("14");
    await page.keyboard.press("Shift+ArrowDown");
    await expect(machines).toHaveValue("0");
    await page.keyboard.type("12.6");
    await page.keyboard.press("Enter");
    await expect(machines).toHaveValue("13");
    await page.keyboard.type("40");
    await page.keyboard.press("Escape");
    await expect(machines).toHaveValue("13");
  });

  test("the slider and its stepper move together", async ({ page }) => {
    await openGallery(page);
    const slider = page.getByRole("slider", { name: "Clock speed" });
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "101");
    await page.keyboard.press("PageDown");
    await expect(page.getByRole("spinbutton", { name: "Clock speed" })).toHaveValue("91");
  });

  test("the select opens with Enter and picks with the arrow keys", async ({ page }) => {
    await openGallery(page);
    const select = page.getByRole("combobox", { name: "Recipe" });
    await select.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(select).toHaveText("Iron Gear");
    await expect(select).toBeFocused();
  });

  test("the switch flips with Space", async ({ page }) => {
    await openGallery(page);
    const snap = page.getByRole("switch", { name: "Snap to grid" });
    await snap.focus();
    await page.keyboard.press("Space");
    await expect(snap).toBeChecked();
  });

  test("tabs move with the arrow keys", async ({ page }) => {
    await openGallery(page);
    await page.getByRole("tab", { name: "Inputs" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Outputs" })).toBeFocused();
    await expect(page.getByRole("tabpanel")).toContainText("Iron Plate");
  });

  test("the menu opens with Enter, moves with the arrows and closes with Escape", async ({ page }) => {
    await openGallery(page);
    const trigger = page.getByRole("button", { name: "Edit" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Cut" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Copy" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("the context menu opens from the keyboard", async ({ page }) => {
    await openGallery(page);
    await page.getByLabel("Context menu area").focus();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menuitem", { name: "Add node…" })).toBeVisible();
  });

  test("the dialog traps focus and returns it on close", async ({ page }) => {
    await openGallery(page);
    const trigger = page.getByRole("button", { name: "Open dialog" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Replace recipe everywhere?" });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      await expect(dialog.locator(":focus")).toHaveCount(1);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("the theme toggle switches the theme from the keyboard", async ({ page }) => {
    await openGallery(page);
    await page.getByRole("button", { name: "Switch to light theme" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});
