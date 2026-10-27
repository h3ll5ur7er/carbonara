// The side panels, the inspector and toasts, in the `inspector` scene (edits go to a fake editing manager).
import { expect, test, type Page } from "@playwright/test";

async function openScene(page: Page, colorScheme: "dark" | "light" = "dark") {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  await page.goto("/?scene=inspector");
  await expect(page.getByRole("heading", { name: "Iron Plate" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

for (const colorScheme of ["dark", "light"] as const) {
  test(`the panels and the inspector in ${colorScheme}`, async ({ page }) => {
    await openScene(page, colorScheme);
    await expect(page).toHaveScreenshot(`inspector-${colorScheme}.png`, { animations: "disabled" });
  });

  test(`an error toast in ${colorScheme}`, async ({ page }) => {
    await openScene(page, colorScheme);
    await page.getByRole("switch", { name: "Somersloop" }).click();
    await expect(page.getByText("No somersloops left in this save.", { exact: true })).toBeVisible();
    await page.mouse.move(720, 450);
    await expect(page).toHaveScreenshot(`toast-error-${colorScheme}.png`, { animations: "disabled" });
  });
}

test("inspector edits go through the editing manager and come back as the new value", async ({ page }) => {
  await openScene(page);
  const clock = page.getByRole("spinbutton", { name: "Clock speed" });
  await clock.focus();
  await page.keyboard.press("ArrowUp");
  await expect(clock).toHaveValue("138.5");
  await expect(page.getByRole("slider", { name: "Clock speed" })).toHaveAttribute("aria-valuenow", "138.5");

  await page.getByRole("slider", { name: "Clock speed" }).focus();
  await page.keyboard.press("End");
  await expect(clock).toHaveValue("250");

  const mode = page.getByRole("combobox", { name: "Mode" });
  await mode.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: "Max output" }).press("Enter");
  await expect(mode).toHaveText("Max output");
});

test("a refused edit leaves the value and explains why", async ({ page }) => {
  await openScene(page);
  const sloop = page.getByRole("switch", { name: "Somersloop" });
  await sloop.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("status").filter({ hasText: "Couldn't apply the edit" })).toBeVisible();
  await expect(sloop).not.toBeChecked();
});

test("a panel resizes from the keyboard and closes with Enter", async ({ page }) => {
  await openScene(page);
  const handle = page.getByRole("separator", { name: "Resize inspector" });
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", "336");
  await page.keyboard.press("End");
  await expect(handle).toHaveAttribute("aria-valuenow", "480");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeHidden();

  await page.getByRole("button", { name: "Inspector" }).click();
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
});

test("a panel resizes by dragging its edge", async ({ page }) => {
  await openScene(page);
  const handle = page.getByRole("separator", { name: "Resize library" });
  const box = await handle.boundingBox();
  if (!box) throw new Error("The handle has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(handle).toHaveAttribute("aria-valuenow", "324");
});

test("the close button and the top bar toggle a panel", async ({ page }) => {
  await openScene(page);
  const toggle = page.getByRole("button", { name: "Library", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Close library" }).click();
  await expect(page.getByRole("complementary", { name: "Library" })).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});
