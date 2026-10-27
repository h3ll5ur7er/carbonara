import { describe, expect, it } from "vitest";
import { CURRENT_DOCUMENT_VERSION, type Document, type Edge, type Node } from "../../../contracts/document";
import type { AnalysisResults, NodeResult } from "../../../contracts/results";
import { templatePack } from "../../scenes/template-pack";
import { balanceMachines } from "./balance";

function factory(nodes: Record<string, Node>, edges: Record<string, Edge>): Document {
  return {
    format: "carbonara",
    version: CURRENT_DOCUMENT_VERSION,
    id: "doc",
    name: "Plates",
    pack: { id: "template", version: "1", hash: "x" },
    graph: { nodes, edges },
    blueprints: {},
    layout: {},
    settings: {},
  };
}

function results(nodes: Record<string, NodeResult>, edges: Record<string, number>): AnalysisResults {
  return {
    documentId: "doc",
    version: 1,
    graph: "root",
    nodes,
    edges: Object.fromEntries(Object.entries(edges).map(([id, perSecond]) => [id, { perSecond }])),
    diagnostics: [],
    totals: { raw: {}, buildings: {} },
  };
}

// Copper plates: 3 s per craft in a furnace, 2 ore in, 1 plate and 1 slag out; a furnace makes 1/3 plate a second.
const document = factory(
  {
    ore: { kind: "source", item: "cuprite-ore", maxPerSecond: 4 },
    smelt: { kind: "recipe", recipe: "copper-plate", pin: { type: "machines", count: 3 } },
    split: { kind: "junction" },
    wire: { kind: "recipe", recipe: "copper-wire", pin: { type: "machines", count: 1 } },
    goal: { kind: "sink", item: "copper-plate", targetPerSecond: 1.5 },
    slag: { kind: "sink", item: "slag" },
  },
  {
    a: { from: "ore", to: "smelt", item: "cuprite-ore" },
    b: { from: "smelt", to: "split", item: "copper-plate" },
    c: { from: "split", to: "wire", item: "copper-plate" },
    d: { from: "split", to: "goal", item: "copper-plate" },
    e: { from: "smelt", to: "slag", item: "slag" },
  },
);
// Three furnaces make 1 plate a second; the wire assembler takes 2 (1 plate per 0.5 s), the goal wants 1.5.
const solved = results(
  {
    smelt: { activity: 3, inputs: { "cuprite-ore": 2 }, outputs: { "copper-plate": 1, slag: 1 } },
    wire: { activity: 1, inputs: { "copper-plate": 2 }, outputs: { "copper-wire": 4 } },
    goal: { activity: 0.5, inputs: { "copper-plate": 0.5 }, outputs: {} },
  },
  { a: 2, b: 1, c: 0.5, d: 0.5, e: 1 },
);

describe("balancing a machine", () => {
  it("fits it to what the consumers downstream want, through junctions", () => {
    // 2 for the wire assembler + 1.5 for the goal = 3.5 plates a second, at 1/3 a furnace: 10.5 furnaces.
    expect(balanceMachines(document, templatePack, solved, "smelt").demand).toBeCloseTo(10.5);
  });

  it("fits it to what the producers upstream can supply", () => {
    // The ore source gives at most 4 a second; a furnace takes 2/3: 6 furnaces.
    expect(balanceMachines(document, templatePack, solved, "smelt").supply).toBeCloseTo(6);
  });

  it("counts only what reaches it past the other consumers, and has no demand without consumers", () => {
    // The splitter gets 1 plate a second and sends 0.5 to the goal; the wire assembler takes 2 a machine.
    const balance = balanceMachines(document, templatePack, solved, "wire");
    expect(balance.supply).toBeCloseTo(0.25);
    expect(balance.demand).toBeUndefined();
  });

  it("works from the pack's recipe when the machine is idle, and says nothing without limits", () => {
    const idle = results({}, {});
    const unlimited = factory(
      { ore: { kind: "source", item: "cuprite-ore" }, smelt: { kind: "recipe", recipe: "copper-plate" } },
      { a: { from: "ore", to: "smelt", item: "cuprite-ore" } },
    );
    expect(balanceMachines(unlimited, templatePack, idle, "smelt")).toEqual({ demand: undefined, supply: undefined });
  });
});
