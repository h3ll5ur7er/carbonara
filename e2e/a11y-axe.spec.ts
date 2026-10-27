// Accessibility audit (CARB-66): axe-core over the canonical scenes in both themes and the live app's main states.
// A violation fails the test with axe's own description of what and where, and the full report is attached to the
// test's results. The one exclusion is scoped to one rule and one kind of element, and says why (see `audit`).
import { writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { chain } from "../src/client/canvas/scenes/chain";
import { openInApp } from "./qol-helpers";

/** WCAG 2.2 A and AA, plus axe's best practices. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function audit(page: Page) {
  const everything = await new AxeBuilder({ page }).withTags(TAGS).disableRules(["target-size"]).analyze();
  // Target size (WCAG 2.5.8) without the canvas's ports: they are drawn in flow units, so their size on screen
  // is the zoom the person picks (10 px at 100%, less zoomed out), like a map's pins. Dragging to a port snaps
  // within 20 px of it, and every port is a keyboard button too (docs/Design.md, Accessibility).
  const targets = await new AxeBuilder({ page }).withRules(["target-size"]).exclude(".react-flow__handle").analyze();
  const results = { violations: [...everything.violations, ...targets.violations] };
  if (results.violations.length > 0) {
    // The full report (contrast ratios, each node's HTML) goes with the test's results.
    const path = test.info().outputPath("axe-violations.json");
    writeFileSync(path, JSON.stringify(results.violations, null, 2));
    await test.info().attach("axe-violations.json", { path, contentType: "application/json" });
  }
  const summary = results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => `${node.target.join(" ")} — ${node.failureSummary ?? ""}`),
  }));
  expect(summary).toEqual([]);
}

const canonicalScenes = ["empty", "chain", "congested", "subgraph", "ghost-paste"];

for (const name of canonicalScenes) {
  for (const colorScheme of ["dark", "light"] as const) {
    test(`scene ${name} in ${colorScheme} passes axe`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto(`/?scene=${name}`);
      await expect(page.locator(`[data-scene="${name}"]`)).toBeAttached();
      await page.evaluate(() => document.fonts.ready);
      await audit(page);
    });
  }
}

for (const colorScheme of ["dark", "light"] as const) {
  test.describe(`the live app in ${colorScheme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    });

    test("welcome passes axe", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByText("Plan your next factory")).toBeVisible();
      await audit(page);
    });

    test("game picker passes axe", async ({ page }) => {
      await page.goto("/?first-run");
      await expect(page.getByRole("heading", { name: "Welcome to Carbonara" })).toBeVisible();
      await audit(page);
    });

    test("new factory dialog passes axe", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "New factory" }).first().click();
      await expect(page.getByRole("dialog", { name: "New factory" })).toBeVisible();
      await audit(page);
    });

    test("a factory with a node in the inspector passes axe", async ({ page }) => {
      await openInApp(page, chain, colorScheme);
      await page.locator('.react-flow__node[data-id="wire"]').click();
      await expect(page.getByRole("complementary", { name: "Inspector" })).toContainText("Copper Wire");
      await audit(page);
    });

    test("the library passes axe", async ({ page }) => {
      await openInApp(page, chain, colorScheme);
      await page.keyboard.press("ControlOrMeta+b");
      await expect(page.getByRole("complementary", { name: "Library" })).toBeVisible();
      await audit(page);
    });

    test("the planner card passes axe", async ({ page }) => {
      await openInApp(page, chain, colorScheme);
      await page.keyboard.press("p");
      await expect(page.getByRole("region", { name: "Plan production" })).toBeVisible();
      await audit(page);
    });

    test("expanded totals pass axe", async ({ page }) => {
      await openInApp(page, chain, colorScheme);
      await page.keyboard.press("t");
      await expect(page.getByRole("region", { name: "Totals" })).toBeVisible();
      await audit(page);
    });

    test("the Sankey overview passes axe", async ({ page }) => {
      await openInApp(page, chain, colorScheme);
      await page.keyboard.press("s");
      await expect(page.getByRole("region", { name: "Sankey overview" })).toBeVisible();
      await audit(page);
    });

    test("the command palette passes axe", async ({ page }) => {
      await openInApp(page, chain, colorScheme);
      await page.keyboard.press("ControlOrMeta+k");
      await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
      await page.keyboard.type("iron");
      await audit(page);
    });

    test("the cheat sheet passes axe", async ({ page }) => {
      await openInApp(page, chain, colorScheme);
      await page.keyboard.press("?");
      await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
      await audit(page);
    });
  });
}
