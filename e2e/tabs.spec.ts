// The live app's document workflow: welcome, new factory, tabs, close, reload, share links, save and open.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const tabs = (page: Page) => page.getByRole("tablist", { name: "Open factories" }).getByRole("tab");

async function newFactory(page: Page, name: string, game = "Template Works") {
  await page.getByRole("button", { name: "New factory" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New factory" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("combobox", { name: "Game" }).click();
  await page.getByRole("option", { name: game }).click();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("starts with a welcome and opens new factories in tabs", async ({ page }) => {
  await expect(page.getByText("Plan your next factory")).toBeVisible();

  await newFactory(page, "Iron");
  await expect(tabs(page)).toHaveText(["Iron"]);
  await expect(tabs(page).first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Plan your next factory")).toBeHidden();

  await newFactory(page, "Steel", "Satisfactory");
  await expect(tabs(page)).toHaveText(["Iron", "Steel"]);
  await expect(page.getByRole("tab", { name: "Steel" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "Iron" }).click();
  await expect(page.getByRole("tab", { name: "Iron" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Close Iron" }).click();
  await expect(tabs(page)).toHaveText(["Steel"]);
  await expect(page.getByRole("tab", { name: "Steel" })).toHaveAttribute("aria-selected", "true");

  await page.reload();
  await expect(tabs(page)).toHaveText(["Steel"]);
});

test("copies a share link that opens a copy of the factory", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], baseURL ? { origin: baseURL } : {});
  await newFactory(page, "Shared plan");
  await page.keyboard.press("ControlOrMeta+Shift+E");
  await expect(page.getByText("Share link copied", { exact: true })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/#doc=[A-Za-z0-9_-]+$/);

  const other = await context.newPage();
  await other.goto(link);
  await expect(other.getByRole("tab", { name: "Shared plan", selected: true })).toBeVisible();
  await expect(other).not.toHaveURL(/#doc=/);
});

test("saves a factory file and opens it again", async ({ page }) => {
  await newFactory(page, "Saved plan");
  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("ControlOrMeta+S")]);
  expect(download.suggestedFilename()).toBe("Saved plan.carbonara");
  const bytes = readFileSync(await download.path());

  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("ControlOrMeta+O")]);
  await chooser.setFiles({ name: "Saved plan.carbonara", mimeType: "application/octet-stream", buffer: bytes });
  await expect(tabs(page)).toHaveText(["Saved plan", "Saved plan"]);
  await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
});

test("says so when a file isn't a factory", async ({ page }) => {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("ControlOrMeta+O")]);
  await chooser.setFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  // Exact: the toast's screen-reader announcement carries the same words.
  await expect(page.getByText("Couldn't open notes.json", { exact: true })).toBeVisible();
  await expect(tabs(page)).toHaveCount(0);
});
