import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Document } from "../../../contracts/document";
import type { AnalysisResults } from "../../../contracts/results";
import { createSceneBuilder } from "../../canvas/model/scene";
import { scenes } from "../../canvas/scenes";
import { templatePack } from "../../scenes/template-pack";
import { estimateLabelWidth, LABEL_ROOM, NODE_WIDTH, sankeyLayout, type SankeyLayout } from "./sankey";

const size = { width: 1200, height: 700 };

function layoutOf(name: "congested" | "chain"): SankeyLayout {
  const { document, results } = scenes[name]();
  const scene = createSceneBuilder()(document.graph, document.layout.root, templatePack);
  return sankeyLayout(scene, results, size);
}

/** A factory from nodes at canvas positions and flows with rates, solved as given. */
function factory(
  nodes: Record<string, { node: Document["graph"]["nodes"][string]; x: number; y: number }>,
  flows: Record<string, { from: string; to: string; item: string; perSecond: number }>,
): SankeyLayout {
  const graph: Document["graph"] = {
    nodes: Object.fromEntries(Object.entries(nodes).map(([id, { node }]) => [id, node])),
    edges: Object.fromEntries(Object.entries(flows).map(([id, { from, to, item }]) => [id, { from, to, item }])),
  };
  const layout = Object.fromEntries(Object.entries(nodes).map(([id, { x, y }]) => [id, { x, y }]));
  const results: AnalysisResults = {
    documentId: "doc",
    version: 1,
    graph: "root",
    nodes: {},
    edges: Object.fromEntries(Object.entries(flows).map(([id, { perSecond }]) => [id, { perSecond }])),
    diagnostics: [],
    totals: { raw: {}, buildings: {} },
  };
  return sankeyLayout(createSceneBuilder()(graph, layout, templatePack), results, size);
}

/** How often bands cross between two columns: their order flips between the same pair of x positions. */
function crossings({ links }: SankeyLayout): number {
  const steps = links
    .filter((link) => !link.backward)
    .flatMap((link) => link.points.slice(1).map((to, index) => ({ from: link.points[index], to, link: link.id })));
  let count = 0;
  for (const [index, a] of steps.entries()) {
    for (const b of steps.slice(index + 1)) {
      if (!a.from || !b.from || a.link === b.link) continue;
      if (Math.abs(a.from.x - b.from.x) > 1 || Math.abs(a.to.x - b.to.x) > 1) continue;
      if ((a.from.y - b.from.y) * (a.to.y - b.to.y) < -1e-6) count++;
    }
  }
  return count;
}

const overlaps = (a: { top: number; bottom: number }, b: { top: number; bottom: number }) =>
  a.top < b.bottom - 1e-6 && b.top < a.bottom - 1e-6;

describe("the Sankey overview", () => {
  const congested = layoutOf("congested");
  const byId = new Map(congested.nodes.map((node) => [node.id, node]));

  it("draws every flow as a band as wide as its rate, on one scale", () => {
    const scales = congested.links.map((link) => link.width / link.perSecond);
    for (const scale of scales) expect(scale).toBeCloseTo(scales[0] ?? 0, 9);
  });

  it("passes flows through junctions instead of giving them columns", () => {
    expect(congested.nodes.some((node) => node.kind === "junction")).toBe(false);
    // The ore splits to both washers; the plates merge into the gear line.
    const between = (source: string, target: string) =>
      congested.links.filter((link) => link.source === source && link.target === target);
    expect(between("ore", "wash-a")).toMatchObject([{ id: "ore-main+ore-a", perSecond: 8, item: "ferrite-ore" }]);
    expect(between("ore", "wash-b")).toMatchObject([{ id: "ore-main+ore-b", perSecond: 14 }]);
    expect(between("smelt-b", "gears")).toMatchObject([{ perSecond: 14 }]);
    // Nothing is lost on the way.
    const total = (end: "source" | "target", id: string) =>
      congested.links.filter((link) => link[end] === id).reduce((sum, link) => sum + link.perSecond, 0);
    expect(total("source", "ore")).toBeCloseTo(22, 9);
    expect(total("target", "gears")).toBeCloseTo(22, 9);
    expect(total("target", "dirty-out")).toBeCloseTo(11, 9);
  });

  it("goes left to right: sources first, the goal last", () => {
    const columns = Math.max(...congested.nodes.map((node) => node.column));
    expect(byId.get("ore")?.column).toBe(0);
    expect(byId.get("water")?.column).toBe(0);
    expect(byId.get("wash-a")?.column).toBe(1);
    expect(byId.get("goal")?.column).toBe(columns);
    expect(byId.get("smelt-a")?.x).toBeGreaterThan(byId.get("wash-a")?.x ?? Infinity);
  });

  it("makes each node as tall as what passes through it, so bands fit their ends", () => {
    for (const node of congested.nodes) {
      const out = congested.links.filter((link) => link.source === node.id).reduce((sum, link) => sum + link.width, 0);
      const into = congested.links.filter((link) => link.target === node.id).reduce((sum, link) => sum + link.width, 0);
      expect(node.height + 1e-9).toBeGreaterThanOrEqual(Math.max(out, into) - 1e-9);
    }
  });

  it("keeps a column's nodes apart, with room for a label above each, inside the view", () => {
    for (const layout of [congested, layoutOf("chain")]) {
      const columns = Math.max(...layout.nodes.map((node) => node.column));
      for (let column = 0; column <= columns; column++) {
        const stacked = layout.nodes.filter((node) => node.column === column).sort((a, b) => a.y - b.y);
        for (const [index, node] of stacked.entries()) {
          expect(node.y).toBeGreaterThanOrEqual(LABEL_ROOM - 1e-6);
          expect(node.y + node.height).toBeLessThanOrEqual(size.height);
          const next = stacked[index + 1];
          if (next) expect(next.y - (node.y + node.height)).toBeGreaterThanOrEqual(LABEL_ROOM - 1e-6);
        }
      }
    }
  });

  it("never runs a band through a node it skips", () => {
    for (const layout of [congested, layoutOf("chain")]) {
      for (const link of layout.links.filter((candidate) => !candidate.backward)) {
        for (const point of link.points.slice(1, -1)) {
          const band = { top: point.y - link.width / 2, bottom: point.y + link.width / 2 };
          const crossed = layout.nodes.filter((node) => point.x > node.x && point.x < node.x + NODE_WIDTH);
          for (const node of crossed) {
            expect(overlaps(band, { top: node.y, bottom: node.y + node.height }), `${link.id} through ${node.id}`).toBe(
              false,
            );
          }
        }
      }
    }
    // The dirty water skips the smelters and the gears on its way to its output.
    expect(congested.links.find((link) => link.target === "dirty-out")?.points.length).toBeGreaterThan(2);
  });

  it("puts labels beside their node, clear of bars, other labels and the bands next to the columns", () => {
    for (const layout of [congested, layoutOf("chain")]) {
      const boxes = layout.nodes.map((node) => {
        const width = estimateLabelWidth(node);
        const left = node.labelAt.anchor === "start" ? node.labelAt.x : node.labelAt.x - width;
        return { node, left, right: left + width, top: node.labelAt.y - 7, bottom: node.labelAt.y + 7 };
      });
      for (const [index, box] of boxes.entries()) {
        const { node } = box;
        // Beside its own bar: touching its column, level with it or just above or below it.
        expect(box.right >= node.x - 1 && box.left <= node.x + NODE_WIDTH + 12, node.id).toBe(true);
        expect(box.bottom >= node.y - LABEL_ROOM && box.top <= node.y + node.height + LABEL_ROOM, node.id).toBe(true);
        for (const other of layout.nodes) {
          const bar = { top: other.y, bottom: other.y + other.height };
          const beside = box.right > other.x && box.left < other.x + NODE_WIDTH;
          expect(beside && overlaps(box, bar), `${node.id}'s label on ${other.id}`).toBe(false);
        }
        for (const other of boxes.slice(index + 1)) {
          const apart = box.right <= other.left || other.right <= box.left;
          expect(apart || !overlaps(box, other), `${node.id}'s label on ${other.node.id}'s`).toBe(true);
        }
        // Where a band leaves or reaches a column it runs level for a while: the label keeps off those stretches.
        for (const link of layout.links.filter((candidate) => !candidate.backward)) {
          for (const [at, towards] of [
            [link.points[0], 1],
            [link.points[link.points.length - 1], -1],
          ] as const) {
            if (!at) continue;
            const stretch = towards > 0 ? { left: at.x, right: at.x + 24 } : { left: at.x - 24, right: at.x };
            const band = { top: at.y - link.width / 2, bottom: at.y + link.width / 2 };
            const across = box.right > stretch.left && box.left < stretch.right;
            expect(across && overlaps(box, band), `${node.id}'s label on ${link.id}`).toBe(false);
          }
        }
      }
    }
  });

  it("orders a column so bands don't cross where they needn't", () => {
    // Both washers take ore and water, so one crossing is unavoidable; there is no other.
    expect(crossings(congested)).toBe(1);
    // Two lines drawn crossed on the canvas: the overview untangles them.
    const crossed = factory(
      {
        a: { node: { kind: "source", item: "ferrite-ore" }, x: 0, y: 0 },
        b: { node: { kind: "source", item: "cuprite-ore" }, x: 0, y: 200 },
        wash: { node: { kind: "recipe", recipe: "wash-ferrite" }, x: 400, y: 200 },
        smelt: { node: { kind: "recipe", recipe: "copper-plate" }, x: 400, y: 0 },
        out: { node: { kind: "sink", item: "clean-ferrite" }, x: 800, y: 200 },
        plates: { node: { kind: "sink", item: "copper-plate" }, x: 800, y: 0 },
      },
      {
        "a-wash": { from: "a", to: "wash", item: "ferrite-ore", perSecond: 4 },
        "b-smelt": { from: "b", to: "smelt", item: "cuprite-ore", perSecond: 6 },
        "wash-out": { from: "wash", to: "out", item: "clean-ferrite", perSecond: 4 },
        "smelt-plates": { from: "smelt", to: "plates", item: "copper-plate", perSecond: 3 },
      },
    );
    expect(crossings(crossed)).toBe(0);
  });

  it("marks flows over their belt's capacity, through the junction where they merge", () => {
    const overloaded = congested.links.filter((link) => link.saturation === "over-capacity").map((link) => link.id);
    expect(overloaded.sort()).toEqual(["plates-a+plates-all", "plates-b+plates-all"]);
    expect(congested.links.find((link) => link.id === "ore-main+ore-b")?.saturation).toBe("near-capacity");
  });

  it("names nodes after their recipe or item, with what passes through", () => {
    expect(byId.get("smelt-b")).toMatchObject({ label: "Iron Plate", kind: "recipe" });
    expect(byId.get("ore")).toMatchObject({ label: "Ferrite Ore", kind: "source", throughput: 22 });
    expect(byId.get("goal")).toMatchObject({ label: "Iron Gear", kind: "sink", throughput: 11 });
  });

  it("routes recycling loops back below the chart instead of through it", () => {
    const chain = layoutOf("chain");
    const loops = chain.links.filter((link) => link.backward);
    expect(loops.map((link) => link.id)).toEqual(["loop-back+water-wash"]);
    const lowest = Math.max(...chain.nodes.map((node) => node.y + node.height));
    expect(loops[0]?.path).toMatch(new RegExp(`L [\\d.]+ ([\\d.]+)`));
    const below = Number(/L [\d.]+ ([\d.]+)/.exec(loops[0]?.path ?? "")?.[1]);
    expect(below).toBeGreaterThan(lowest);
    expect(chain.nodes.every((node) => node.y + node.height <= size.height)).toBe(true);
  });

  it("keeps every node on the chart whatever the rates", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.01, max: 1000, noNaN: true }), { minLength: 3, maxLength: 3 }),
        (rates) => {
          const [a = 1, b = 1, c = 1] = rates;
          const layout = factory(
            {
              ore: { node: { kind: "source", item: "ferrite-ore" }, x: 0, y: 0 },
              split: { node: { kind: "junction" }, x: 200, y: 0 },
              one: { node: { kind: "sink", item: "ferrite-ore" }, x: 400, y: 0 },
              two: { node: { kind: "sink", item: "ferrite-ore" }, x: 400, y: 200 },
              three: { node: { kind: "sink", item: "ferrite-ore" }, x: 400, y: 400 },
            },
            {
              in: { from: "ore", to: "split", item: "ferrite-ore", perSecond: a + b + c },
              one: { from: "split", to: "one", item: "ferrite-ore", perSecond: a },
              two: { from: "split", to: "two", item: "ferrite-ore", perSecond: b },
              three: { from: "split", to: "three", item: "ferrite-ore", perSecond: c },
            },
          );
          return (
            layout.links.length === 3 &&
            layout.nodes.every((node) => node.y >= 0 && node.y + node.height <= size.height + 1e-6)
          );
        },
      ),
    );
  });

  it("is empty without results", () => {
    const { document } = scenes.congested();
    const scene = createSceneBuilder()(document.graph, document.layout.root, templatePack);
    expect(sankeyLayout(scene, null, size)).toEqual({ nodes: [], links: [] });
  });
});
