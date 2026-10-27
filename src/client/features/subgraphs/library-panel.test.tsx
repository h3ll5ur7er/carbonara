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

  it("says how to make a blueprint while there are none", () => {
    renderLibrary({ entries: [], collapseKeys: ["Ctrl", "G"] });
    expect(screen.getByText("No blueprints yet")).toBeTruthy();
  });
});
