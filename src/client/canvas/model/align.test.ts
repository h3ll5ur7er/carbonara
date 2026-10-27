import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { templatePack } from "../../scenes/template-pack";
import { align, distribute, straightenChain, type Box } from "./align";
import { createSceneBuilder } from "./scene";

const box = (id: string, x: number, y: number, width = 100, height = 50, locked = false): Box => ({
  id,
  x,
  y,
  width,
  height,
  ...(locked && { locked: true }),
});

const boxes = [box("a", 0, 0), box("b", 200, 30, 60, 90), box("c", 50, 300, 200, 20)];

describe("align", () => {
  it.each([
    ["left", { b: { x: 0, y: 30 }, c: { x: 0, y: 300 } }],
    ["centre", { a: { x: 80, y: 0 }, b: { x: 100, y: 30 }, c: { x: 30, y: 300 } }],
    ["right", { a: { x: 160, y: 0 }, c: { x: 60, y: 300 } }],
    ["top", { b: { x: 200, y: 0 }, c: { x: 50, y: 0 } }],
    ["middle", { a: { x: 0, y: 135 }, b: { x: 200, y: 115 }, c: { x: 50, y: 150 } }],
    ["bottom", { a: { x: 0, y: 270 }, b: { x: 200, y: 230 } }],
  ] as const)(
    "%s lines the nodes up on the selection's edge or centre, moving only those that need it",
    (mode, moves) => {
      expect(align(boxes, mode)).toEqual(moves);
    },
  );

  it("lines up on the locked nodes, which stay put", () => {
    expect(align([box("a", 0, 0), box("b", 200, 0, 100, 50, true)], "left")).toEqual({ a: { x: 200, y: 0 } });
  });

  it("needs two nodes", () => {
    expect(align([box("a", 0, 0)], "left")).toEqual({});
  });
});

describe("distribute", () => {
  it("spaces the nodes evenly between the outermost two, which stay", () => {
    const row = [box("a", 0, 0, 100), box("b", 120, 0, 50), box("c", 400, 0, 100), box("d", 600, 9, 100)];
    // Inner span 700 - 350 of widths = 350 over 3 gaps.
    expect(distribute(row, "horizontal")).toEqual({ b: { x: 217, y: 0 }, c: { x: 383, y: 0 } });
  });

  it("works down a column too, and needs three nodes", () => {
    expect(distribute([box("a", 0, 0), box("b", 0, 70), box("c", 0, 300)], "vertical")).toEqual({
      b: { x: 0, y: 150 },
    });
    expect(distribute([box("a", 0, 0), box("b", 0, 70)], "vertical")).toEqual({});
  });

  it("leaves equal gaps, to the flow unit, whatever the sizes (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: -500, max: 500 }), fc.integer({ min: 10, max: 200 })), {
          minLength: 3,
          maxLength: 8,
        }),
        (spans) => {
          const row = spans.map(([x, width], index) => box(`n${index}`, x, 0, width));
          const moved = distribute(row, "horizontal");
          // In the order distributing keeps: by centre before the move.
          const placed = [...row]
            .sort((a, b) => a.x + a.width / 2 - (b.x + b.width / 2))
            .map((node) => ({ ...node, ...moved[node.id] }));
          const gaps = placed.slice(1).map((node, index) => {
            const before = placed[index];
            return node.x - ((before?.x ?? 0) + (before?.width ?? 0));
          });
          for (const gap of gaps) expect(Math.abs(gap - (gaps[0] ?? 0))).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});

describe("straightenChain", () => {
  const scene = createSceneBuilder()(
    {
      nodes: {
        ore: { kind: "source", item: "cuprite-ore" },
        plate: { kind: "recipe", recipe: "copper-plate" },
        wire: { kind: "recipe", recipe: "copper-wire" },
        out: { kind: "sink", item: "copper-wire" },
        slag: { kind: "sink", item: "slag" },
      },
      edges: {
        a: { from: "ore", to: "plate", item: "cuprite-ore" },
        b: { from: "plate", to: "wire", item: "copper-plate" },
        c: { from: "wire", to: "out", item: "copper-wire" },
        d: { from: "plate", to: "slag", item: "slag" },
      },
    },
    {
      ore: { x: 0, y: 0 },
      plate: { x: 300, y: 40 },
      wire: { x: 700, y: -60 },
      out: { x: 1100, y: 200 },
      slag: { x: 700, y: 400 },
    },
    templatePack,
  );

  it("moves each node so its flows run straight from the first node on", () => {
    const moved = straightenChain(scene, ["ore", "plate", "wire", "out"]);
    // ore's port is at 36; plate's cuprite input at 108; plate's plate output at 136; wire's input at 108 …
    expect(moved).toEqual({
      plate: { x: 300, y: 36 - 108 },
      wire: { x: 700, y: 36 - 108 + 136 - 108 },
      out: { x: 1100, y: 36 - 108 + 136 - 108 + 108 + 28 - 36 },
    });
  });

  it("leaves nodes outside the selection, and locked nodes, where they are", () => {
    const locked = {
      ...scene,
      nodes: scene.nodes.map((view) => (view.id === "wire" ? { ...view, locked: true as const } : view)),
    };
    const moved = straightenChain(locked, ["ore", "plate", "wire", "out"]);
    expect(moved).not.toHaveProperty("wire");
    expect(moved).not.toHaveProperty("slag");
    // The output lines up with the wire machine where it actually is.
    expect(moved["out"]).toEqual({ x: 1100, y: -60 + 136 - 36 });
  });
});
