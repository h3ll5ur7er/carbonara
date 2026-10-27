import { describe, expect, it } from "vitest";
import { back, bookmark, forward, freeSlot, startNavigation, visit } from "./navigation";

const size = { width: 1000, height: 800 };
const view = (x: number, y = 0, zoom = 1) => ({ x, y, zoom });

describe("back and forward", () => {
  it("records views that differ enough from the last one, like a browser's history", () => {
    let state = visit(startNavigation(), view(0), size);
    state = visit(state, view(-100), size); // a nudge of the view: not a new place, but where you are now
    state = visit(state, view(-600), size);
    state = visit(state, view(-600, 0, 1.5), size); // zoomed in a lot: a new place
    // Back returns to where you were before each jump.
    expect(state.back).toEqual([view(-100), view(-600)]);
    expect(state.current).toEqual(view(-600, 0, 1.5));
  });

  it("goes back and forward, and a new place drops what was ahead", () => {
    let state = visit(visit(visit(startNavigation(), view(0), size), view(-600), size), view(-1200), size);
    const one = back(state);
    expect(one.target).toEqual(view(-600));
    state = visit(one.state, view(-600), size);
    expect(forward(state).target).toEqual(view(-1200));
    state = visit(state, view(-3000), size);
    expect(forward(state).target).toBeUndefined();
    expect(back(state).target).toEqual(view(-600));
  });

  it("has nowhere to go at either end", () => {
    const state = visit(startNavigation(), view(0), size);
    expect(back(state).target).toBeUndefined();
    expect(forward(state).target).toBeUndefined();
  });
});

describe("bookmarks", () => {
  it("keeps a view in a slot, and finds the first free slot", () => {
    let state = bookmark(startNavigation(), 1, view(5));
    expect(state.bookmarks[1]).toEqual(view(5));
    expect(freeSlot(state)).toBe(2);
    state = bookmark(state, 2, view(6));
    expect(freeSlot(state)).toBe(3);
  });

  it("reuses slot 1 once all nine are taken", () => {
    let state = startNavigation();
    for (let slot = 1; slot <= 9; slot++) state = bookmark(state, slot, view(slot));
    expect(freeSlot(state)).toBe(1);
  });
});
