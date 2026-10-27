import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CanvasScene, NodeView } from "./scene";
import { graphWindow, serves, windowAround, type Box } from "./window";

function node(id: string, x: number, y: number): NodeView {
  return { id, kind: "junction", position: { x, y }, width: 40, height: 40, ports: [] };
}

function flow(source: string, target: string) {
  return { id: `${source}>${target}`, source, target, sourceHandle: "out", targetHandle: "in", item: "ore" };
}

const scene: CanvasScene = {
  nodes: [node("near", 100, 100), node("far", 50_000, 100), node("other", 20_000, 9_000)],
  edges: [flow("far", "other")],
};

describe("the window of a large graph", () => {
  it("holds the nodes in the box", () => {
    expect(graphWindow(scene).nodesIn({ x: 0, y: 0, width: 1000, height: 1000 })).toEqual(new Set(["near"]));
  });

  it("holds both ends of a flow that crosses the box, though neither end is in it", () => {
    // The flow from (50,000, 100) to (20,000, 9,000) passes over x = 30,000.
    const box = { x: 30_000, y: 0, width: 1000, height: 10_000 };
    expect(graphWindow(scene).nodesIn(box)).toEqual(new Set(["far", "other"]));
  });

  it("finds exactly the nodes whose cards overlap the box", () => {
    const position = fc.integer({ min: -20_000, max: 20_000 });
    const box = fc.record({
      x: position,
      y: position,
      width: fc.integer({ min: 0, max: 30_000 }),
      height: fc.integer({ min: 0, max: 30_000 }),
    });
    fc.assert(
      fc.property(fc.array(fc.tuple(position, position), { maxLength: 60 }), box, (places, view: Box) => {
        const nodes = places.map(([x, y], index) => node(`n${index}`, x, y));
        const inside = nodes.filter(
          ({ position: { x, y } }) =>
            x <= view.x + view.width && view.x <= x + 40 && y <= view.y + view.height && view.y <= y + 40,
        );
        expect(graphWindow({ nodes, edges: [] }).nodesIn(view)).toEqual(new Set(inside.map(({ id }) => id)));
      }),
    );
  });
});

describe("moving the window", () => {
  const view = { x: 0, y: 0, width: 1000, height: 500 };

  it("reaches half a view past the view on every side", () => {
    expect(windowAround(view)).toEqual({ x: -500, y: -250, width: 2000, height: 1000 });
  });

  it("stays while the view is inside it, and moves when the view leaves it or it is far too large", () => {
    const window = windowAround(view);
    expect(serves(window, { ...view, x: 400 })).toBe(true);
    expect(serves(window, { ...view, x: 600 })).toBe(false);
    expect(serves(window, { x: 0, y: 0, width: 100, height: 50 })).toBe(false);
  });
});
