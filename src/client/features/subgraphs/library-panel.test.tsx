// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryEntry } from "./library";
import { BlueprintLibrary, type BlueprintLibraryProps } from "./library-panel";

const ore = { id: "ore", name: "Cuprite Ore", form: "solid" as const };
const wire = { id: "wire", name: "Copper Wire", form: "solid" as const };
const entries: LibraryEntry[] = [
  { id: "line", name: "Copper line", inputs: [ore], outputs: [wire], instances: 2, nodes: 3, placeable: true },
  { id: "self", name: "Smelting", inputs: [], outputs: [], instances: 1, nodes: 1, placeable: false },
];

function renderLibrary(props: Partial<BlueprintLibraryProps> = {}) {
  const handlers = { onPick: vi.fn(), onPlaceInView: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn() };
  render(<BlueprintLibrary entries={entries} placing={null} {...handlers} {...props} />);
  return handlers;
}

afterEach(cleanup);

describe("the blueprint library", () => {
  it("shows each blueprint with what it takes and makes and how often it's placed", () => {
    renderLibrary();
    const line = screen.getByRole("button", { name: /Copper line/ });
    expect(line.textContent).toContain("Placed 2 times");
    expect(line.textContent).toContain("Takes Cuprite Ore; makes Copper Wire.");
  });

  it("picks a blueprint up on a press, and places it mid-view from the keyboard", async () => {
    const { onPick, onPlaceInView } = renderLibrary();
    const line = screen.getByRole("button", { name: /Copper line/ });
    fireEvent.pointerDown(line, { button: 0, clientX: 10, clientY: 10 });
    expect(onPick).toHaveBeenCalledWith("line");
    line.focus();
    await userEvent.keyboard("{Enter}");
    expect(onPlaceInView).toHaveBeenCalledWith("line");
  });

  it("drops what's let go of over the canvas after a drag, and cancels anywhere else", () => {
    const { onDrop, onCancel } = renderLibrary();
    const line = screen.getByRole("button", { name: /Copper line/ });
    const pane = document.createElement("div");
    pane.className = "react-flow__pane";
    document.body.append(pane);
    // jsdom has no layout, so it can't say what's under a point: this test does.
    const at = vi.fn<(x: number, y: number) => Element | null>();
    document.elementFromPoint = at;

    at.mockReturnValue(pane);
    fireEvent.pointerDown(line, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 400, clientY: 300 });
    expect(onDrop).toHaveBeenCalledWith("line", { x: 400, y: 300 });

    at.mockReturnValue(line);
    fireEvent.pointerDown(line, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 60, clientY: 10 });
    expect(onCancel).toHaveBeenCalledOnce();

    // A click without a drag keeps the blueprint following the pointer.
    fireEvent.pointerDown(line, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 11, clientY: 10 });
    expect(onDrop).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    pane.remove();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  it("won't place a blueprint inside itself", () => {
    const { onPick } = renderLibrary();
    const self = screen.getByRole("button", { name: /Smelting/ });
    expect(self).toHaveProperty("disabled", true);
    expect(self.textContent).toContain("Can't go inside itself");
    fireEvent.pointerDown(self, { button: 0 });
    expect(onPick).not.toHaveBeenCalled();
  });

  describe("managing blueprints", () => {
    const manage = () => ({ rename: vi.fn(), duplicate: vi.fn(), remove: vi.fn() });
    const unplacedEntry: LibraryEntry = {
      id: "old",
      name: "Old line",
      inputs: [],
      outputs: [],
      instances: 0,
      nodes: 1,
      placeable: true,
    };
    /** Opens a card's ⋯ menu from the keyboard and picks an item. */
    async function choose(card: string, item: string) {
      screen.getByRole("button", { name: `Actions for ${card}` }).focus();
      await userEvent.keyboard("{Enter}");
      await userEvent.click(await screen.findByRole("menuitem", { name: item }));
    }

    it("renames a blueprint on its card: Enter keeps the name, Escape drops it", async () => {
      const handlers = manage();
      renderLibrary({ manage: handlers });
      await choose("Copper line", "Rename…");
      const name = screen.getByRole("textbox", { name: "Blueprint name" });
      await userEvent.clear(name);
      await userEvent.type(name, "Wire works{Enter}");
      expect(handlers.rename).toHaveBeenCalledExactlyOnceWith("line", "Wire works");
      await choose("Copper line", "Rename…");
      await userEvent.type(screen.getByRole("textbox", { name: "Blueprint name" }), " 2{Escape}");
      expect(handlers.rename).toHaveBeenCalledOnce();
      expect(screen.getByRole("button", { name: /^Copper line/ })).toBeTruthy();
    });

    it("duplicates a blueprint", async () => {
      const handlers = manage();
      renderLibrary({ manage: handlers });
      await choose("Smelting", "Duplicate");
      expect(handlers.duplicate).toHaveBeenCalledExactlyOnceWith("self");
    });

    it("asks before deleting a placed blueprint, saying its instances go too", async () => {
      const handlers = manage();
      renderLibrary({ manage: handlers });
      await choose("Copper line", "Delete…");
      const dialog = screen.getByRole("dialog", { name: "Delete “Copper line”?" });
      expect(dialog.textContent).toContain("It's placed 2 times. Deleting it removes all 2 instances");
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(handlers.remove).not.toHaveBeenCalled();
      await choose("Copper line", "Delete…");
      await userEvent.click(screen.getByRole("button", { name: "Delete blueprint and 2 instances" }));
      expect(handlers.remove).toHaveBeenCalledExactlyOnceWith(["line"]);
    });

    it("deletes one placed nowhere straight away, and all of those at once", async () => {
      const handlers = manage();
      renderLibrary({ manage: handlers, entries: [...entries, unplacedEntry] });
      await choose("Old line", "Delete…");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(handlers.remove).toHaveBeenLastCalledWith(["old"]);
      await userEvent.click(screen.getByRole("button", { name: "Delete 1 unplaced blueprint" }));
      expect(handlers.remove).toHaveBeenLastCalledWith(["old"]);
    });
  });

  it("says how to make a blueprint while there are none", () => {
    renderLibrary({ entries: [], collapseKeys: ["Ctrl", "G"] });
    expect(screen.getByText("No blueprints yet")).toBeTruthy();
  });
});
