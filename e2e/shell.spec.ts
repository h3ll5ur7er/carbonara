// The real app (backend worker and all) starts into the shell. Its document workflow is in tabs.spec.ts;
// the shell's look is covered by the scenes in scenes.spec.ts.
import { expect, test } from "@playwright/test";

test("the app opens on the welcome when no factory is open", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Factory canvas")).toBeVisible();
  await expect(page.getByText("Plan your next factory")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Inspector" })).toContainText("Nothing selected");
});

test("the theme toggle overrides the system theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
