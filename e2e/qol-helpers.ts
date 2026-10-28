// Helpers for the editor quality-of-life tests: the canonical scenes opened in the live app (real backend
// worker, real editing and layout engines) through a share link, and reading where nodes ended up.
import { expect, type Page } from "@playwright/test";
import { writeShareLink } from "../src/access/documents/share-links";
import { buildScene, type SceneSpec } from "../src/client/canvas/scenes/build";
import type { PackData } from "../src/contracts/pack";

/** Results aren't needed: the live app solves the document itself. */
const NO_PACK: PackData = {
  units: { rate: "per_second" },
  items: [],
  buildings: [],
  recipes: [],
  logistics: [],
  resources: [],
  starters: [],
  categories: [],
  unlocks: [],
};

/** Opens a copy of the scene's document in the live app and waits for its nodes. */
export async function openInApp(page: Page, spec: SceneSpec, colorScheme: "dark" | "light" = "dark") {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  const scene = buildScene(NO_PACK, spec);
  await page.goto(`/#doc=${writeShareLink(scene.document)}`);
  // The app's start (the dev server's first module compile, the backend worker, the solver's WebAssembly) can take
  // longer than an assertion's default 5 s on a loaded runner; what the specs test starts after it.
  await expect(page.locator(".react-flow__node")).toHaveCount(Object.keys(spec.nodes).length, { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  // A factory opens readably, around its centre (CARB-139); these specs work on all of it, so they fit it first.
  await page.keyboard.press("f");
  await viewSettled(page);
}

/** Waits until the canvas's view stops moving (a fit or a zoom lands a frame or more after its key). */
export async function viewSettled(page: Page) {
  const transform = () => page.locator(".react-flow__viewport").evaluate((viewport) => viewport.style.transform);
  let last = await transform();
  await expect
    .poll(async () => {
      const now = await transform();
      const still = now === last;
      last = now;
      return still;
    })
    .toBe(true);
}

export interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The nodes' boxes on screen, frames left out (they sit behind everything). */
export function nodeBoxes(page: Page): Promise<Box[]> {
  return page.locator(".react-flow__node:not(.react-flow__node-frame)").evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { id: (node as HTMLElement).dataset.id ?? "", x: box.x, y: box.y, width: box.width, height: box.height };
    }),
  );
}

/** Pairs of nodes whose boxes overlap. */
export function overlaps(boxes: Box[]): string[] {
  const pairs: string[] = [];
  boxes.forEach((a, index) => {
    for (const b of boxes.slice(index + 1)) {
      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) {
        pairs.push(`${a.id}/${b.id}`);
      }
    }
  });
  return pairs;
}

/** Where a node's top-left corner is, in flow units (from its transform). */
export function flowPosition(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.locator(`.react-flow__node[data-id="${id}"]`).evaluate((node) => {
    const matrix = new DOMMatrix(getComputedStyle(node).transform);
    return { x: matrix.e, y: matrix.f };
  });
}
