import { describe, expect, it } from "vitest";
import { createSceneBuilder } from "../../canvas/model/scene";
import { scenes } from "../../canvas/scenes";
import { templatePack } from "../../scenes/template-pack";
import { sankeyLayout, type SankeyLayout } from "./sankey";

const size = { width: 1200, height: 700 };

function layoutOf(name: "congested" | "chain"): SankeyLayout {
  const { document, results } = scenes[name]();
  const scene = createSceneBuilder()(document.graph, document.layout.root, templatePack);
  return sankeyLayout(scene, results, size);
}

describe("the Sankey overview", () => {
  const congested = layoutOf("congested");
  const byId = new Map(congested.nodes.map((node) => [node.id, node]));

  it("draws every flow as a band as wide as its rate, on one scale", () => {
    expect(congested.links).toHaveLength(14);
    const scales = congested.links.map((link) => link.width / link.perSecond);
    for (const scale of scales) expect(scale).toBeCloseTo(scales[0] ?? 0, 9);
  });

  it("goes left to right: sources first, the goal last", () => {
    const columns = Math.max(...congested.nodes.map((node) => node.column));
    expect(byId.get("ore")?.column).toBe(0);
    expect(byId.get("water")?.column).toBe(0);
    expect(byId.get("goal")?.column).toBe(columns);
    expect(byId.get("smelt-a")?.x).toBeGreaterThan(byId.get("wash-a")?.x ?? Infinity);
  });

  it("makes each node as tall as what passes through it, so bands fit their ends", () => {
    for (const node of congested.nodes) {
      const out = congested.links.filter((link) => link.source === node.id).reduce((sum, link) => sum + link.width, 0);
      const into = congested.links.filter((link) => link.target === node.id).reduce((sum, link) => sum + link.width, 0);
      expect(node.height + 1e-9).toBeGreaterThanOrEqual(Math.max(out, into));
    }
  });

  it("keeps a column's nodes apart and inside the view, in the order the factory has them", () => {
    for (let column = 0; column <= 6; column++) {
      const stacked = congested.nodes.filter((node) => node.column === column).sort((a, b) => a.y - b.y);
      for (const [index, node] of stacked.entries()) {
        expect(node.y).toBeGreaterThanOrEqual(0);
        expect(node.y + node.height).toBeLessThanOrEqual(size.height);
        const next = stacked[index + 1];
        if (next) expect(next.y).toBeGreaterThan(node.y + node.height);
      }
    }
    // wash-a sits above wash-b on the canvas, and so in the overview.
    expect(byId.get("wash-a")?.y).toBeLessThan(byId.get("wash-b")?.y ?? 0);
  });

  it("marks flows over their belt's capacity", () => {
    const overloaded = congested.links.filter((link) => link.saturation === "over-capacity").map((link) => link.id);
    expect(overloaded).toEqual(["plates-all"]);
    expect(congested.links.find((link) => link.id === "ore-b")?.saturation).toBe("near-capacity");
  });

  it("names nodes after their recipe or item, with what passes through", () => {
    expect(byId.get("smelt-b")).toMatchObject({ label: "Iron Plate", kind: "recipe" });
    expect(byId.get("ore")).toMatchObject({ label: "Ferrite Ore", kind: "source", throughput: 22 });
    expect(byId.get("goal")).toMatchObject({ label: "Iron Gear", kind: "sink", throughput: 11 });
  });

  it("routes recycling loops back below the chart instead of through it", () => {
    const chain = layoutOf("chain");
    const loop = chain.links.find((link) => link.id === "loop-back");
    expect(loop?.backward).toBe(true);
    expect(chain.links.filter((link) => link.backward)).toHaveLength(1);
    expect(chain.nodes.every((node) => node.y + node.height <= size.height)).toBe(true);
  });

  it("is empty without results", () => {
    const { document } = scenes.congested();
    const scene = createSceneBuilder()(document.graph, document.layout.root, templatePack);
    expect(sankeyLayout(scene, null, size)).toEqual({ nodes: [], links: [] });
  });
});
