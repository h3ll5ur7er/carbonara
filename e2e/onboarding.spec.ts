// The first run (CARB-64): which game do you play, a starter factory, and the tour through the core loop. Automated
// browsers skip the first run unless the address asks for it (`?first-run`), so the other specs never see it.
import { expect, test, type Page } from "@playwright/test";
import { viewSettled } from "./qol-helpers";

/** The tour card: a non-modal dialog that names its step. */
const tour = (page: Page) => page.getByRole("dialog").and(page.locator("[data-tour-step]"));
const tourCard = (page: Page) => page.locator("[data-tour-step]");
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);

/** Drags a connection from one port to another. */
async function connect(page: Page, from: string, to: string) {
  const start = await page.locator(from).boundingBox();
  const end = await page.locator(to).boundingBox();
  if (!start || !end) throw new Error(`${from} or ${to} not on screen`);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 12 });
  await page.mouse.up();
}

/** The tour progress saved in the preferences (IndexedDB), read straight from the database. */
function savedTour(page: Page): Promise<unknown> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("carbonara-preferences");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains("entries")) return resolve(undefined);
          const read = database.transaction("entries").objectStore("entries").get("tour");
          read.onsuccess = () => resolve(read.result);
          database.close();
        };
      }),
  );
}

async function pickGame(page: Page, game = "Template Works") {
  await page
    .getByRole("list", { name: "Games" })
    .getByRole("button", { name: new RegExp(game) })
    .click();
  await expect(page.getByRole("tab", { name: "Copper wire", selected: true })).toBeVisible();
  // The starter opens fitted whole for the tour, which may glide there.
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  await viewSettled(page);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("a new player picks a game, gets a starter factory and completes the tour", async ({ page }) => {
  await page.goto("/?first-run");
  await expect(page.getByRole("heading", { name: "Welcome to Carbonara" })).toBeVisible();
  await pickGame(page);
  await expect(node(page, "plates")).toBeVisible();

  // The tour takes the focus, so the keyboard alone gets through its explaining steps.
  await expect(tourCard(page)).toHaveAttribute("data-tour-step", "welcome");
  await expect(page.getByRole("button", { name: "Start the tour" })).toBeFocused();
  await page.keyboard.press("Enter");

  // Add a recipe from the palette.
  await expect(tourCard(page)).toHaveAttribute("data-tour-step", "add");
  await expect(tour(page)).toContainText("Step 1 of 5");
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("copper wire");
  await page.keyboard.press("Enter");

  // Connect it through its ports, on both sides.
  await expect(tourCard(page)).toHaveAttribute("data-tour-step", "connect");
  const wire = page.locator(".react-flow__node-recipe").filter({ hasText: "Copper Wire" });
  await expect(wire).toBeVisible();
  await page.keyboard.press("f");
  await viewSettled(page);
  await connect(
    page,
    '.react-flow__node[data-id="plates"] [data-handleid="out:copper-plate"]',
    '.react-flow__node-recipe:not([data-id="plates"]) [data-handleid="in:copper-plate"]',
  );
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  await connect(
    page,
    '.react-flow__node-recipe:not([data-id="plates"]) [data-handleid="out:copper-wire"]',
    '.react-flow__node[data-id="wire"] [data-handleid="in:copper-wire"]',
  );

  // Set a target in the inspector.
  await expect(tourCard(page)).toHaveAttribute("data-tour-step", "target");
  // With both side panels open the fit lands in compact cards, without rates (CARB-139): close the library.
  await page.keyboard.press("ControlOrMeta+B");
  await page.keyboard.press("f");
  await viewSettled(page);
  await node(page, "wire").click();
  const target = page.getByRole("complementary", { name: "Inspector" }).getByLabel("Target");
  await target.fill("1");
  await target.press("Enter");

  // See the solve.
  await expect(tourCard(page)).toHaveAttribute("data-tour-step", "solve");
  await expect(node(page, "wire")).toContainText("100% of 1/s");
  await tour(page).getByRole("button", { name: "Next" }).click();

  // Plan with P.
  await expect(tourCard(page)).toHaveAttribute("data-tour-step", "plan");
  await page.keyboard.press("p");
  await expect(page.getByRole("region", { name: "Plan production" })).toBeVisible();
  await expect(tourCard(page)).toHaveAttribute("data-tour-step", "done");
  await tour(page).getByRole("button", { name: "Finish" }).click();
  await expect(tourCard(page)).toBeHidden();
  await expect.poll(() => savedTour(page)).toEqual({ step: 6, finished: true });

  // Done is done: neither the tour nor the game picker comes back.
  await page.reload();
  await expect(page.getByRole("tab", { name: "Copper wire" })).toBeVisible();
  await page.locator('button[aria-label="Close Copper wire"]').click();
  await expect(page.getByText("Plan your next factory")).toBeVisible();
  await expect(tourCard(page)).toBeHidden();
});

test("skipping the first run keeps it away, and the palette brings the tour back where it was left", async ({
  page,
}) => {
  await page.goto("/?first-run");
  await page.getByRole("button", { name: /Skip/ }).click();
  await expect(page.getByText("Plan your next factory")).toBeVisible();
  // Saved in the background: a reload before the write lands would see a first run again.
  await expect.poll(() => savedTour(page)).toEqual({ step: 0, finished: true });
  await page.reload();
  await expect(page.getByText("Plan your next factory")).toBeVisible();

  // With nothing open, "Take the tour" asks for a game first.
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("Take the tour");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Take the tour" })).toBeVisible();
  await pickGame(page);
  await page.getByRole("button", { name: "Start the tour" }).click();
  await expect(tourCard(page)).toHaveAttribute("data-tour-step", "add");
  await page.getByRole("button", { name: "Close the tour" }).click();
  await expect(tourCard(page)).toBeHidden();
  await expect.poll(() => savedTour(page)).toEqual({ step: 1, finished: true });

  await page.reload();
  await expect(page.getByRole("tab", { name: "Copper wire" })).toBeVisible();
  await expect(tourCard(page)).toBeHidden();
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("Take the tour");
  await page.keyboard.press("Enter");
  await expect(tourCard(page)).toHaveAttribute("data-tour-step", "add");
});

for (const colorScheme of ["dark", "light"] as const) {
  test(`the first run's game picker and tour in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/?first-run");
    await expect(page.getByRole("heading", { name: "Welcome to Carbonara" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`game-picker-${colorScheme}.png`, { animations: "disabled" });

    await pickGame(page);
    await page.getByRole("button", { name: "Start the tour" }).click();
    await expect(tourCard(page)).toHaveAttribute("data-tour-step", "add");
    await expect(page.locator(".tour-spotlight")).toBeVisible();
    await expect(page).toHaveScreenshot(`tour-add-${colorScheme}.png`, { animations: "disabled" });
  });
}
