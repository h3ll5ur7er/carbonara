// The real app (backend worker and all) starts into the shell. Its document workflow is in tabs.spec.ts;
// the shell's look is covered by the scenes in scenes.spec.ts.
import { expect, test } from "@playwright/test";

test("the app opens on the welcome when no factory is open, without the side panels", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Factory canvas")).toBeVisible();
  await expect(page.getByText("Plan your next factory")).toBeVisible();
  // Nothing to inspect and no pack to browse beside the welcome (CARB-116).
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeHidden();
  await expect(page.getByRole("complementary", { name: "Library" })).toBeHidden();
});

test("the side panels come back as they were once a factory opens", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Plan your next factory")).toBeVisible();
  // Closing the library on the welcome is remembered for the factory.
  await page.keyboard.press("ControlOrMeta+B");
  await page.getByRole("button", { name: "New factory" }).first().click();
  await page.getByRole("dialog", { name: "New factory" }).getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Library" })).toBeHidden();
  await page.keyboard.press("ControlOrMeta+B");
  await expect(page.getByRole("complementary", { name: "Library" })).toBeVisible();
});

test("the theme toggle overrides the system theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
