import { expect, test } from "@playwright/test";

test("the app starts", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Carbonara");
});
