import ELK from "elkjs/lib/elk.bundled.js";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Graph, Node, Position } from "../../contracts/document";
import type { NodeShape } from "../../contracts/layout";
import { arrange, type ArrangeInput } from "./arrange";
import { chain, congested, shapeOf, type LayoutScene } from "./scenes.fixture";

const elk = new ELK();

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rects(scene: LayoutScene, positions: Record<string, Position>): [string, Rect][] {
  return Object.keys(scene.graph.nodes)
    .filter((id) => scene.graph.nodes[id]?.kind !== "frame")
    .map((id) => {
      const shape = scene.shapes[id] ?? { width: 0, height: 0 };
      const at = positions[id] ?? { x: 0, y: 0 };
      return [id, { x: at.x, y: at.y, width: shape.width, height: shape.height }];
    });
}

/** Pairs of nodes (frames aside) whose cards overlap. */
function overlapping(scene: LayoutScene, positions: Record<string, Position>): string[] {
  const all = rects(scene, positions);
  const pairs: string[] = [];
  all.forEach(([a, ra], index) => {
    for (const [b, rb] of all.slice(index + 1)) {
      if (ra.x < rb.x + rb.width && rb.x < ra.x + ra.width && ra.y < rb.y + rb.height && rb.y < ra.y + ra.height) {
        pairs.push(`${a}/${b}`);
      }
    }
  });
  return pairs;
}

function portPoint(
  scene: LayoutScene,
  positions: Record<string, Position>,
  node: string,
  side: "in" | "out",
  item: string,
) {
  const shape = scene.shapes[node];
  const port = shape?.ports.find((candidate) => candidate.side === side && (candidate.item ?? item) === item);
  const at = positions[node] ?? { x: 0, y: 0 };
  return { x: at.x + (port?.x ?? 0), y: at.y + (port?.y ?? 0) };
}

/** How many pairs of flows cross, each drawn as a straight line between its ports. */
function crossings(scene: LayoutScene, positions: Record<string, Position>): number {
  const segments = Object.values(scene.graph.edges).map((edge) => [
    portPoint(scene, positions, edge.from, "out", edge.item),
    portPoint(scene, positions, edge.to, "in", edge.item),
  ]);
  let count = 0;
  segments.forEach(([a, b], index) => {
    for (const [c, d] of segments.slice(index + 1)) if (a && b && c && d && cross(a, b, c, d)) count++;
  });
  return count;
}

type Point = { x: number; y: number };
function cross(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  // Flows sharing a port meet, they don't cross.
  const same = (p: Point, q: Point) => p.x === q.x && p.y === q.y;
  if (same(a, c) || same(a, d) || same(b, c) || same(b, d)) return false;
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** The scene's nodes dealt into a grid in an unhelpful order: what a factory built in a hurry looks like. */
function scrambled(scene: LayoutScene): Record<string, Position> {
  const ids = Object.keys(scene.graph.nodes).sort().reverse();
  return Object.fromEntries(
    ids.map((id, index) => [id, { ...scene.positions[id], x: (index % 4) * 480, y: Math.floor(index / 4) * 360 }]),
  );
}

function input(scene: LayoutScene, positions = scene.positions, extra: Partial<ArrangeInput> = {}): ArrangeInput {
  return { graph: scene.graph, positions, shapes: scene.shapes, direction: "right", ...extra };
}

function merged(positions: Record<string, Position>, moved: Record<string, { x: number; y: number }>) {
  return Object.fromEntries(Object.entries(positions).map(([id, at]) => [id, { ...at, ...moved[id] }]));
}

describe("arranging the canonical scenes", () => {
  for (const [name, scene] of [
    ["chain", chain],
    ["congested", congested],
  ] as const) {
    for (const direction of ["right", "down"] as const) {
      it(`leaves no overlaps in ${name}, ${direction}`, async () => {
        const moved = await arrange(input(scene, scrambled(scene), { direction }), elk);
        expect(overlapping(scene, merged(scrambled(scene), moved))).toEqual([]);
      });
    }

    it(`crosses fewer flows in ${name} than a scrambled layout, and no more than the hand-made one`, async () => {
      const start = scrambled(scene);
      const arranged = merged(start, await arrange(input(scene, start), elk));
      expect(crossings(scene, arranged)).toBeLessThan(crossings(scene, start));
      expect(crossings(scene, arranged)).toBeLessThanOrEqual(crossings(scene, scene.positions));
    });

    it(`runs ${name} left to right: every forward flow leaves its producer to the right`, async () => {
      const arranged = merged(scene.positions, await arrange(input(scene), elk));
      const backward = Object.values(scene.graph.edges).filter(
        (edge) => (arranged[edge.to]?.x ?? 0) <= (arranged[edge.from]?.x ?? 0),
      );
      // Only the water loop's way back may run against the flow.
      expect(backward.length).toBeLessThanOrEqual(1);
    });
  }

  it("keeps the arranged block where the nodes were, on the grid", async () => {
    const moved = await arrange(input(congested), elk);
    const xs = Object.values(moved).map((at) => at.x);
    const ys = Object.values(moved).map((at) => at.y);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.min(...ys)).toBe(0);
  });
});

describe("frames", () => {
  const inside = (frame: Position, at: Position, shape: { width: number; height: number }) => {
    const centre = { x: at.x + shape.width / 2, y: at.y + shape.height / 2 };
    return (
      centre.x > frame.x &&
      centre.x < frame.x + (frame.width ?? 0) &&
      centre.y > frame.y &&
      centre.y < frame.y + (frame.height ?? 0)
    );
  };
  const members = {
    "water-frame": ["purify", "note", "sludge"],
    "copper-frame": ["cuprite-ore", "smelt-copper", "slag", "wire", "wire-split"],
  };

  it("move and fit around the nodes they hold, which stay together", async () => {
    const after = merged(chain.positions, await arrange(input(chain), elk));
    for (const [frame, ids] of Object.entries(members)) {
      const box = after[frame];
      if (!box) throw new Error(`no ${frame}`);
      for (const id of ids)
        expect(inside(box, after[id] ?? box, chain.shapes[id] ?? { width: 0, height: 0 })).toBe(true);
      // Nothing else ends up inside the frame.
      for (const id of Object.keys(chain.graph.nodes).filter((other) => !ids.includes(other) && other !== frame)) {
        if (chain.graph.nodes[id]?.kind === "frame") continue;
        expect(inside(box, after[id] ?? box, chain.shapes[id] ?? { width: 0, height: 0 }), `${id} in ${frame}`).toBe(
          false,
        );
      }
    }
  });

  it("stay where they are, with their nodes arranged freely, when they can't all move", async () => {
    const positions = { ...chain.positions, slag: { x: 768, y: 760, locked: true as const } };
    const moved = await arrange(input(chain, positions), elk);
    expect(moved).not.toHaveProperty("copper-frame");
    expect(moved).toHaveProperty("water-frame");
  });
});

describe("what arranging leaves alone", () => {
  it("never moves locked nodes, or notes outside frames", async () => {
    const positions = {
      ...congested.positions,
      goal: { x: 1872, y: 352, locked: true as const },
      memo: { x: 0, y: -300 },
    };
    const scene = {
      ...congested,
      graph: { ...congested.graph, nodes: { ...congested.graph.nodes, memo: { kind: "note" as const, text: "hi" } } },
      shapes: { ...congested.shapes, memo: { width: 240, height: 120, ports: [] } },
    };
    const moved = await arrange(input(scene, positions), elk);
    for (const id of ["memo", "goal"]) expect(moved).not.toHaveProperty(id);
    expect(overlapping(scene, merged(positions, moved))).toEqual([]);
  });

  it("puts sources first", async () => {
    const after = merged(chain.positions, await arrange(input(chain), elk));
    // The water source feeds the loop's merge, deep in the flow, yet starts the flow with the ore.
    expect(after["water"]?.x).toBe(after["ferrite-ore"]?.x);
    expect(after["water"]?.x ?? 0).toBeLessThan(after["water-merge"]?.x ?? 0);
  });

  it("arranges only the selection, and keeps it clear of the rest", async () => {
    const selection = ["wash-a", "wash-b", "smelt-a", "smelt-b"];
    const moved = await arrange(input(congested, congested.positions, { nodeIds: selection }), elk);
    expect(Object.keys(moved).sort()).toEqual([...selection].sort());
    expect(overlapping(congested, merged(congested.positions, moved))).toEqual([]);
    // The washers feed the smelters, so they sit in a column to their left.
    expect(moved["wash-a"]?.x).toBe(moved["wash-b"]?.x);
    expect(moved["smelt-a"]?.x ?? 0).toBeGreaterThan(moved["wash-a"]?.x ?? 0);
  });

  it("does nothing when nothing can move", async () => {
    const positions = Object.fromEntries(
      Object.entries(congested.positions).map(([id, at]) => [id, { ...at, locked: true as const }]),
    );
    await expect(arrange(input(congested, positions), elk)).resolves.toEqual({});
  });
});

describe("arranging any graph (property)", () => {
  const nodeKinds: Node[] = [
    { kind: "junction" },
    { kind: "source", item: "ferrite-ore" },
    { kind: "sink", item: "iron-plate" },
    { kind: "recipe", recipe: "iron-plate" },
    { kind: "recipe", recipe: "wash-ferrite" },
    { kind: "note", text: "Note" },
    { kind: "frame", label: "Frame" },
  ];
  const graphs = fc
    .tuple(
      fc.array(
        fc.tuple(
          fc.nat(nodeKinds.length - 1),
          fc.integer({ min: -900, max: 900 }),
          fc.integer({ min: -900, max: 900 }),
          fc.boolean(),
        ),
        {
          minLength: 1,
          maxLength: 14,
        },
      ),
      fc.array(fc.tuple(fc.nat(13), fc.nat(13)), { maxLength: 20 }),
      fc.constantFrom("right" as const, "down" as const),
    )
    .map(([nodes, links, direction]) => {
      const graph: Graph = { nodes: {}, edges: {} };
      const positions: Record<string, Position> = {};
      const shapes: Record<string, NodeShape> = {};
      nodes.forEach(([kind, x, y, locked], index) => {
        const node = nodeKinds[kind] ?? { kind: "junction" };
        graph.nodes[`n${index}`] = node;
        positions[`n${index}`] = {
          x,
          y,
          ...(node.kind === "frame" && { width: 600, height: 480 }),
          ...(locked && index % 3 === 0 && { locked: true as const }),
        };
        shapes[`n${index}`] = shapeOf(node, positions[`n${index}`]);
      });
      links.forEach(([from, to], index) => {
        if (from < nodes.length && to < nodes.length) {
          graph.edges[`e${index}`] = { from: `n${from}`, to: `n${to}`, item: "iron-plate" };
        }
      });
      return { scene: { graph, positions, shapes }, direction };
    });

  it("never overlaps two nodes it moved, nor a moved node with a locked one", async () => {
    await fc.assert(
      fc.asyncProperty(graphs, async ({ scene, direction }) => {
        const moved = await arrange(input(scene, scene.positions, { direction }), elk);
        const after = merged(scene.positions, moved);
        const pairs = overlapping(scene, after).filter((pair) => {
          const [a = "", b = ""] = pair.split("/");
          return moved[a] !== undefined || moved[b] !== undefined;
        });
        expect(pairs).toEqual([]);
        for (const [id, at] of Object.entries(scene.positions)) if (at.locked) expect(moved).not.toHaveProperty(id);
      }),
      { numRuns: 60 },
    );
  }, 30_000);
});
