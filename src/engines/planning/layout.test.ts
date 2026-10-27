import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { COLUMN_GAP, GRID, layered, type LayoutEdge, type LayoutNode } from "./layout";

const box = (id: string, role: LayoutNode["role"] = "between", height = 120): LayoutNode => ({
  id,
  role,
  width: 312,
  height,
});

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe("the layered layout", () => {
  const chain = [box("ore", "source", 72), box("smelt"), box("gear"), box("goal", "target", 72)];
  const flows: LayoutEdge[] = [
    { from: "ore", to: "smelt" },
    { from: "smelt", to: "gear" },
    { from: "gear", to: "goal" },
  ];

  it("lays a chain out left to right, one column per step, a gap apart", () => {
    const at = layered(chain, flows);
    expect(at["ore"]?.x).toBe(0);
    expect(at["smelt"]?.x).toBe(312 + COLUMN_GAP);
    expect(at["gear"]?.x).toBe(2 * (312 + COLUMN_GAP));
    expect(at["goal"]?.x).toBe(3 * (312 + COLUMN_GAP));
  });

  it("puts every target in the last column and every source in the first", () => {
    const nodes = [
      box("ore", "source"),
      box("coal", "source"),
      box("smelt"),
      box("plates", "target"),
      box("gear"),
      box("gears", "target"),
    ];
    const edges = [
      { from: "ore", to: "smelt" },
      { from: "smelt", to: "plates" },
      { from: "smelt", to: "gear" },
      { from: "gear", to: "gears" },
      { from: "coal", to: "gear" },
    ];
    const at = layered(nodes, edges);
    expect(at["plates"]?.x).toBe(at["gears"]?.x);
    expect(at["coal"]?.x).toBe(0);
  });

  it("follows cycles without looping: the flow back is the one that runs right to left", () => {
    const nodes = [box("water", "source"), box("wash"), box("purify"), box("plates", "target")];
    const edges = [
      { from: "water", to: "wash" },
      { from: "wash", to: "purify" },
      { from: "purify", to: "wash" },
      { from: "wash", to: "plates" },
    ];
    const at = layered(nodes, edges);
    expect(at["wash"]?.x).toBeLessThan(at["purify"]?.x ?? 0);
  });

  it("lines a node up with what feeds it", () => {
    const at = layered(chain, flows);
    const centre = (id: string, height: number) => (at[id]?.y ?? 0) + height / 2;
    expect(Math.abs(centre("smelt", 120) - centre("gear", 120))).toBeLessThanOrEqual(GRID);
  });

  it("never overlaps nodes, keeps them on the grid, and starts at the origin", () => {
    const graphs = fc.integer({ min: 1, max: 14 }).chain((count) =>
      fc.record({
        heights: fc.array(
          fc.integer({ min: 2, max: 12 }).map((rows) => rows * 24),
          {
            minLength: count,
            maxLength: count,
          },
        ),
        edges: fc.array(fc.tuple(fc.nat(count - 1), fc.nat(count - 1)), { maxLength: count * 2 }),
      }),
    );
    fc.assert(
      fc.property(graphs, ({ heights, edges }) => {
        const nodes = heights.map((height, index) => box(`n${index}`, "between", height));
        const at = layered(
          nodes,
          edges.filter(([from, to]) => from !== to).map(([from, to]) => ({ from: `n${from}`, to: `n${to}` })),
        );
        const rects = nodes.map((node) => ({
          ...(at[node.id] as { x: number; y: number }),
          width: node.width,
          height: node.height,
        }));
        for (const [index, rect] of rects.entries()) {
          expect(rect.x % GRID).toBe(0);
          expect(rect.y % GRID).toBe(0);
          for (const other of rects.slice(index + 1)) expect(overlaps(rect, other)).toBe(false);
        }
        expect(Math.min(...rects.map((rect) => rect.x))).toBe(0);
        expect(Math.min(...rects.map((rect) => rect.y))).toBe(0);
      }),
    );
  });
});
