import { describe, expect, it } from "vitest";
import type { Graph } from "../../../contracts/document";
import type { AnalysisResults } from "../../../contracts/results";
import { templatePack } from "../../scenes/template-pack";
import { suggest } from "./suggest";

const rate = (perSecond: number) => `${perSecond}/s`;

/** A circuit assembler fed copper wire but no iron plate, and a copper smelter whose slag goes nowhere. */
const graph: Graph = {
  nodes: {
    circuits: { kind: "recipe", recipe: "circuit" },
    wire: { kind: "recipe", recipe: "copper-wire" },
    copper: { kind: "recipe", recipe: "copper-plate" },
    out: { kind: "sink", item: "circuit" },
  },
  edges: {
    a: { from: "copper", to: "wire", item: "copper-plate" },
    b: { from: "wire", to: "circuits", item: "copper-wire" },
    c: { from: "circuits", to: "out", item: "circuit" },
  },
};

function results(diagnostics: AnalysisResults["diagnostics"]): AnalysisResults {
  return {
    documentId: "doc",
    version: 1,
    graph: "root",
    nodes: {},
    edges: {},
    diagnostics,
    totals: { raw: {}, buildings: {} },
  };
}

describe("suggest", () => {
  it("offers a maker for what a machine is short of, saying how much, connected to it", () => {
    const found = suggest({
      graph,
      pack: templatePack,
      results: results([{ kind: "deficit", node: "circuits", item: "iron-plate", perSecond: 0.2 }]),
      selected: [],
      rate,
    });
    expect(found[0]).toEqual({
      recipe: "iron-plate",
      reason: "Circuit lacks 0.2/s of Iron Plate",
      connectTo: { node: "circuits", item: "iron-plate", side: "in" },
    });
  });

  it("offers a user for what's made and nothing takes", () => {
    const found = suggest({
      graph,
      pack: templatePack,
      results: results([{ kind: "surplus", node: "copper", item: "slag", perSecond: 1.5 }]),
      selected: [],
      rate,
    });
    expect(found).toEqual([
      {
        recipe: "concrete",
        reason: "Uses the 1.5/s of Slag nothing takes yet",
        connectTo: { node: "copper", item: "slag", side: "out" },
      },
    ]);
  });

  it("around the selection, offers recipes for its open ports, before the factory's shortages", () => {
    const found = suggest({
      graph,
      pack: templatePack,
      results: results([{ kind: "surplus", node: "copper", item: "slag", perSecond: 1.5 }]),
      selected: ["circuits"],
      rate,
    });
    expect(found.map((suggestion) => [suggestion.recipe, suggestion.reason])).toEqual([
      ["iron-plate", "Makes Iron Plate for Circuit"],
      ["concrete", "Uses the 1.5/s of Slag nothing takes yet"],
    ]);
  });

  it("offers each recipe once, for the first reason, and no recipe for raw resources", () => {
    const found = suggest({
      graph: { nodes: { gears: { kind: "recipe", recipe: "iron-gear" } }, edges: {} },
      pack: templatePack,
      results: results([{ kind: "deficit", node: "gears", item: "iron-plate", perSecond: 1 }]),
      selected: ["gears"],
      rate,
    });
    expect(found.map((suggestion) => [suggestion.recipe, suggestion.reason])).toEqual([
      ["iron-plate", "Makes Iron Plate for Iron Gear"],
      ["motor", "Uses the Iron Gear it makes"],
    ]);
    // Copper plate needs cuprite ore, a raw resource: a source supplies it, not a recipe.
    const smelter = suggest({
      graph: { nodes: { copper: { kind: "recipe", recipe: "copper-plate" } }, edges: {} },
      pack: templatePack,
      results: null,
      selected: ["copper"],
      rate,
    });
    expect(smelter.map((suggestion) => suggestion.connectTo.item)).not.toContain("cuprite-ore");
  });

  it("offers nothing for an empty factory, and at most a few", () => {
    expect(suggest({ graph: { nodes: {}, edges: {} }, pack: templatePack, results: null, selected: [], rate })).toEqual(
      [],
    );
    const shortages = ["iron-plate", "copper-wire", "iron-gear", "circuit", "copper-plate", "concrete", "coal"];
    const many = suggest({
      graph: { nodes: { motor: { kind: "recipe", recipe: "motor" } }, edges: {} },
      pack: templatePack,
      results: results(shortages.map((item) => ({ kind: "deficit", node: "motor", item, perSecond: 1 }))),
      selected: [],
      rate,
    });
    expect(many.length).toBeLessThanOrEqual(5);
  });
});
