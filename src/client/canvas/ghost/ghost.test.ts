import { describe, expect, it } from "vitest";
import type { AnalysisResults } from "../../../contracts/results";
import { templatePack } from "../../scenes/template-pack";
import { createSceneBuilder } from "../model/scene";
import {
  boundsOf,
  followPointer,
  ghostContent,
  isGhost,
  neighbours,
  placedPositions,
  withGhostResults,
  type Ghost,
} from "./ghost";

const ghost: Ghost = {
  graph: {
    nodes: {
      ore: { kind: "source", item: "cuprite-ore" },
      smelt: { kind: "recipe", recipe: "copper-plate" },
    },
    edges: { "ore-smelt": { from: "ore", to: "smelt", item: "cuprite-ore" } },
  },
  positions: { ore: { x: 480, y: 120 }, smelt: { x: 840, y: 96 } },
  results: {
    nodes: { smelt: { activity: 3, inputs: { "cuprite-ore": 2 }, outputs: { "copper-plate": 1, slag: 1 } } },
    edges: { "ore-smelt": { perSecond: 2 } },
  },
  placement: { mode: "fixed", offset: { x: 24, y: -48 } },
  label: "Proposal",
};

const scene = () => createSceneBuilder()(ghost.graph, ghost.positions, templatePack);

describe("the ghost view", () => {
  it("draws the ghost's nodes and edges under ids of their own, so they never clash with the document's", () => {
    const view = ghostContent(scene(), "Proposal");
    expect(view.scene.nodes.map((node) => node.id)).toEqual(["ghost:ore", "ghost:smelt"]);
    expect(view.scene.edges).toEqual([
      expect.objectContaining({ id: "ghost:ore-smelt", source: "ghost:ore", target: "ghost:smelt" }),
    ]);
    expect(view.scene.nodes.every((node) => isGhost(node.id))).toBe(true);
    expect(isGhost("smelt")).toBe(false);
  });

  it("knows the area its nodes cover", () => {
    // The source pill is 264 × 72, the smelter card 312 wide and 4 port rows high.
    expect(boundsOf(scene())).toEqual({ x: 480, y: 96, width: 840 + 312 - 480, height: 100 + 3 * 28 });
    expect(ghostContent(scene(), "Proposal").bounds).toEqual(boundsOf(scene()));
  });

  it("shows its own numbers next to the document's", () => {
    const document: AnalysisResults = {
      documentId: "doc",
      version: 4,
      graph: "root",
      nodes: { smelt: { activity: 1, inputs: {}, outputs: {} } },
      edges: {},
      diagnostics: [{ kind: "surplus", node: "smelt", item: "slag", perSecond: 1 }],
      totals: { raw: {}, buildings: {} },
    };
    const merged = withGhostResults(document, ghost.results);
    expect(merged?.nodes["smelt"]?.activity).toBe(1);
    expect(merged?.nodes["ghost:smelt"]?.activity).toBe(3);
    expect(merged?.edges["ghost:ore-smelt"]?.perSecond).toBe(2);
    expect(merged?.diagnostics).toEqual(document.diagnostics);
    expect(merged?.version).toBe(4);
  });

  it("has numbers even before the document is solved, and none without a ghost", () => {
    expect(withGhostResults(null, ghost.results)?.nodes["ghost:smelt"]?.activity).toBe(3);
    expect(withGhostResults(null, undefined)).toBeNull();
  });

  it("is revealed with the part of the graph it sits beside, not the whole factory", () => {
    const bounds = { x: 1000, y: 0, width: 400, height: 200 };
    const node = (id: string, x: number, y: number) => ({ id, x, y, width: 100, height: 50 });
    expect(
      neighbours(bounds, [
        node("beside", 850, 20),
        node("above", 1100, -120),
        node("far-left", 300, 0),
        node("far-below", 1100, 800),
        node("ghost:smelt", 1000, 0),
      ]),
    ).toEqual(["beside", "above"]);
  });

  it("following the pointer, centres on it with its top-left corner on the grid", () => {
    const bounds = { x: 480, y: 96, width: 672, height: 184 };
    // The centre (816, 188) to (1000, 500): 184, 312 raw; the corner lands on (672, 408), the grid's nearest.
    const placed = followPointer(bounds, { x: 1000, y: 500 }, [], { grid: 24, threshold: 6 });
    expect(placed.offset).toEqual({ x: 192, y: 312 });
    expect((bounds.x + placed.offset.x) % 24).toBe(0);
    expect((bounds.y + placed.offset.y) % 24).toBe(0);
    expect(placed.guides).toEqual([]);
  });

  it("following the pointer, lines up with a nearby node and shows the guide", () => {
    const bounds = { x: 0, y: 0, width: 200, height: 100 };
    const beside = { x: 400, y: 303, width: 100, height: 100 };
    const placed = followPointer(bounds, { x: 100, y: 352 }, [beside], { grid: 24, threshold: 6 });
    expect(placed.offset).toEqual({ x: 0, y: 303 });
    expect(placed.guides).toContainEqual(expect.objectContaining({ axis: "y", at: 303 }));
  });

  it("gives the positions to place it at: its own, moved by the offset", () => {
    expect(placedPositions(ghost.positions, { x: 24, y: -48 })).toEqual({
      ore: { x: 504, y: 72 },
      smelt: { x: 864, y: 48 },
    });
  });
});
