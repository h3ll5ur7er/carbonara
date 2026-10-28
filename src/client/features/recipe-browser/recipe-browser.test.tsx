// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setCanvasEditActions, type CanvasEditActions } from "../../canvas/edit-actions";
import { usePlacing } from "../../canvas/placing";
import { templatePack } from "../../scenes/template-pack";
import { TooltipProvider } from "../../ui/tooltip";
import { useBrowser } from "./browser-store";
import { useRecipeMemory } from "./memory";
import { RecipeBrowser } from "./recipe-browser";

const initialBrowser = useBrowser.getState();
let addNode: ReturnType<typeof vi.fn<CanvasEditActions["addNode"]>>;

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // jsdom lays nothing out: give the list a view tall enough for every row of the template pack.
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 2000 });
});

beforeEach(() => {
  addNode = vi.fn<CanvasEditActions["addNode"]>(() => "new-node");
  setCanvasEditActions({ addNode } as unknown as CanvasEditActions);
});

afterEach(() => {
  cleanup();
  setCanvasEditActions(undefined);
  useBrowser.setState(initialBrowser, true);
  useRecipeMemory.setState({ loaded: false, recipes: {} });
  usePlacing.setState({ placing: null });
});

function renderBrowser() {
  render(
    <TooltipProvider>
      <RecipeBrowser packId="template" pack={templatePack} />
    </TooltipProvider>,
  );
  return screen.getByRole("tree", { name: "Recipes" });
}

/** The names of the tree's rows, groups as `▸ name`. */
function rows(tree: HTMLElement): string[] {
  return within(tree)
    .getAllByRole("treeitem")
    .map((item) => {
      const label = item.getAttribute("aria-label") ?? "";
      return item.getAttribute("aria-level") === "1" && item.hasAttribute("aria-expanded")
        ? `▸ ${label.split(",")[0] ?? ""}`
        : (label.split(",")[0] ?? "");
    });
}

describe("the recipe browser", () => {
  it("lists every recipe by machine, a small pack's groups open, recycling left out", () => {
    const tree = renderBrowser();
    expect(rows(tree)).toEqual([
      "▸ Furnace",
      "Coal from Sludge",
      "Copper Plate",
      "Iron Plate",
      "Iron Plate (Coal Smelting)",
      "▸ Assembler",
      "Circuit",
      "Copper Wire",
      "Iron Gear",
      "Motor",
      "▸ Ore Washer",
      "Washed Ferrite",
      "▸ Water Purifier",
      "Water",
      "▸ Mixer",
      "Concrete",
    ]);
    expect(screen.queryByRole("treeitem", { name: /Motor Recycling/ })).toBeNull();
  });

  it("groups by what unlocks recipes, as the pack orders them", async () => {
    const tree = renderBrowser();
    await userEvent.click(screen.getByRole("tab", { name: "Unlock" }));
    expect(rows(tree).filter((row) => row.startsWith("▸"))).toEqual([
      "▸ From the start",
      "▸ Ore washing",
      "▸ Electronics",
      "▸ Motors",
      "▸ Waste reuse",
    ]);
  });

  it("closes and opens a group", async () => {
    const tree = renderBrowser();
    const furnace = screen.getByRole("treeitem", { name: /^Furnace/ });
    expect(furnace.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(within(furnace).getByText("Furnace"));
    expect(furnace.getAttribute("aria-expanded")).toBe("false");
    expect(rows(tree)).not.toContain("Copper Plate");
  });

  it("finds recipes as one types, best first, and shows recycling only when asked", async () => {
    const tree = renderBrowser();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search recipes" }), "motor");
    expect(rows(tree)).toEqual(["Motor"]);
    useBrowser.setState({ recycling: true });
    expect(await screen.findByRole("treeitem", { name: /^Motor Recycling/ })).toBeTruthy();
    expect(rows(tree)).toEqual(["Motor", "Motor Recycling"]);
  });

  it("says when nothing matches", async () => {
    renderBrowser();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search recipes" }), "unobtainium");
    expect(screen.getByText("Nothing matches “unobtainium”")).toBeTruthy();
  });

  it("adds a recipe on a click, selected mid-view, and keeps it under Recent", () => {
    renderBrowser();
    const wire = screen.getByRole("treeitem", { name: /^Copper Wire/ });
    const row = wire.firstElementChild as HTMLElement;
    fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 11, clientY: 10 });
    expect(addNode).toHaveBeenCalledWith({ kind: "recipe", recipe: "copper-wire" }, { label: "Add Copper Wire" });
    const recent = screen.getByRole("treeitem", { name: /^Recent/ });
    expect(recent.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("treeitem", { name: /^Copper Wire/ })).toHaveLength(2);
  });

  it("picks a recipe up when the press moves, for the canvas to place where it's let go", () => {
    renderBrowser();
    const row = screen.getByRole("treeitem", { name: /^Motor/ }).firstElementChild as HTMLElement;
    fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 30 });
    expect(usePlacing.getState().placing).toMatchObject({ node: { kind: "recipe", recipe: "motor" }, label: "Motor" });
    // Let go over the panel, not the canvas: never mind.
    document.elementFromPoint = () => row;
    fireEvent.pointerUp(window, { clientX: 40, clientY: 30 });
    expect(usePlacing.getState().placing).toBeNull();
    expect(addNode).not.toHaveBeenCalled();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  it("is a tree for the keyboard: ↓ from the search, ← and → close and open, Enter adds", async () => {
    renderBrowser();
    screen.getByRole("searchbox", { name: "Search recipes" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    // Into the list, on its first recipe.
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^Coal from Sludge/);
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^Furnace/);
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement?.getAttribute("aria-expanded")).toBe("false");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^Circuit/);
    await userEvent.keyboard("{Enter}");
    expect(addNode).toHaveBeenCalledWith({ kind: "recipe", recipe: "circuit" }, { label: "Add Circuit" });
    await userEvent.keyboard("{Home}");
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^Recent|^Furnace/);
  });

  it("stars recipes into Favourites with the star or F, and unstars them", async () => {
    renderBrowser();
    await userEvent.click(screen.getByRole("button", { name: "Add Motor to favourites" }));
    const favourites = screen.getByRole("treeitem", { name: /^Favourites/ });
    expect(favourites.getAttribute("aria-label")).toContain("1 recipe");
    screen.getAllByRole("treeitem", { name: /^Concrete/ })[0]?.focus();
    await userEvent.keyboard("f");
    expect(screen.getByRole("treeitem", { name: /^Favourites/ }).getAttribute("aria-label")).toContain("2 recipes");
    expect(screen.getAllByRole("treeitem", { name: /^Concrete.*favourite$/ }).length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole("button", { name: "Remove Motor from favourites" })[0] as HTMLElement);
    expect(screen.getByRole("treeitem", { name: /^Favourites/ }).getAttribute("aria-label")).toContain("1 recipe");
  });
});
