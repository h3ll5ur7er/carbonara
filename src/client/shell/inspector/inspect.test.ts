import { describe, expect, it } from "vitest";
import { Document } from "../../../contracts/document";
import { PackData } from "../../../contracts/pack";
import type { PluginDescription } from "../../../contracts/plugin";
import type { AnalysisResults } from "../../../contracts/results";
import { inspectNode, productionEdit } from "./inspect";

const pack = PackData.parse({
  units: { rate: "per_minute" },
  items: [
    { id: "ore", name: "Cuprite Ore", form: "solid" },
    { id: "plate", name: "Copper Plate", form: "solid" },
  ],
  buildings: [{ id: "furnace", name: "Furnace" }],
  recipes: [{ id: "copper-plate", buildings: ["furnace"], time: 3, in: { ore: 2 }, out: { plate: 1 } }],
});

const document = Document.parse({
  format: "carbonara",
  version: 1,
  id: "d",
  name: "Copper",
  pack: { id: "template", version: "1.0.0", hash: "h" },
  graph: {
    nodes: {
      ore: { kind: "source", item: "ore" },
      smelt: { kind: "recipe", recipe: "copper-plate", pin: { type: "machines", count: 3 } },
      free: { kind: "recipe", recipe: "copper-plate" },
      out: { kind: "sink", item: "plate", targetPerSecond: 1 },
      split: { kind: "junction" },
    },
    edges: {},
  },
});

const results: AnalysisResults = {
  documentId: "d",
  version: 1,
  graph: "root",
  nodes: {
    ore: { activity: 2, inputs: {}, outputs: { ore: 2 } },
    smelt: { activity: 3, inputs: { ore: 2 }, outputs: { plate: 1 } },
    out: { activity: 1, inputs: { plate: 1 }, outputs: {} },
  },
  edges: {},
  diagnostics: [],
  totals: { raw: {}, buildings: {} },
};

const inspect = (nodeId: string) => inspectNode({ document, pack, results, nodeId });

describe("inspectNode", () => {
  it("shows a pinned recipe with its machine count", () => {
    expect(inspect("smelt")).toMatchObject({
      title: "Copper Plate",
      subtitle: "Furnace · 3 × 100%",
      production: { kind: "machines", label: "Machines", unit: "", value: 3, actual: 3 },
    });
  });

  it("shows an unpinned recipe as automatic", () => {
    expect(inspect("free")?.production).toMatchObject({ kind: "machines", value: null });
  });

  it("shows a sink's target and a source's limit in the pack's rate unit", () => {
    expect(inspect("out")).toMatchObject({
      title: "Copper Plate",
      subtitle: "Output",
      production: { kind: "target", label: "Target", unit: "/min", value: 60, actual: 60 },
    });
    expect(inspect("ore")).toMatchObject({
      title: "Cuprite Ore",
      subtitle: "Source",
      production: { kind: "limit", label: "Supply limit", unit: "/min", value: null, actual: 120 },
    });
  });

  it("shows other nodes without production settings", () => {
    expect(inspect("split")).toMatchObject({ title: "Junction" });
    expect(inspect("split")?.production).toBeUndefined();
  });

  it("shows the plugin's fields for the node's building, with the node's values", () => {
    const clock = { kind: "number", label: "Clock speed", min: 1, max: 250, unit: "%", default: 100 } as const;
    const plugin: PluginDescription = {
      nodeFields: { furnace: { clock } },
      settingsFields: {},
      metrics: { power: { label: "Power use", unit: "MW" } },
    };
    const clocked = structuredClone(document);
    clocked.graph.nodes.smelt = { kind: "recipe", recipe: "copper-plate", fields: { clock: 150 } };
    const withMetrics: AnalysisResults = {
      ...results,
      nodes: {
        ...results.nodes,
        smelt: { activity: 3, inputs: {}, outputs: {}, derived: { power: 13.4321, heat: 2 } },
      },
      diagnostics: [
        { kind: "warning", node: "smelt", message: "Clock speed 150 % needs a power shard" },
        { kind: "error", node: "free", message: "Not this one" },
        { kind: "deficit", node: "smelt", item: "ore", perSecond: 1 },
      ],
    };
    expect(inspectNode({ document: clocked, pack, results: withMetrics, nodeId: "smelt", plugin })).toMatchObject({
      fields: { clock },
      values: { clock: 150 },
      metrics: [
        { label: "Power use", value: "13.43 MW" },
        { label: "heat", value: "2" },
      ],
      problems: [{ kind: "warning", message: "Clock speed 150 % needs a power shard" }],
    });
    expect(inspectNode({ document, pack, results, nodeId: "free", plugin })).toMatchObject({
      fields: { clock },
      values: {},
      metrics: [],
      problems: [],
    });
  });

  it("shows nothing for a node that isn't there", () => {
    expect(inspect("ghost")).toBeNull();
  });
});

describe("productionEdit", () => {
  it("pins a recipe's machine count, or lets the solver choose", () => {
    expect(productionEdit(document, pack, "smelt", 4)).toEqual({
      commands: [{ type: "setPin", graph: "root", id: "smelt", pin: { type: "machines", count: 4 } }],
      label: "Set Copper Plate to 4 machines",
    });
    expect(productionEdit(document, pack, "smelt", null)).toEqual({
      commands: [{ type: "setPin", graph: "root", id: "smelt", pin: null }],
      label: "Let the solver choose Copper Plate machines",
    });
  });

  it("sets a sink's target in items per second", () => {
    expect(productionEdit(document, pack, "out", 90)).toEqual({
      commands: [{ type: "setRate", graph: "root", id: "out", perSecond: 1.5 }],
      label: "Set Copper Plate target to 90/min",
    });
  });

  it("removes a source's limit", () => {
    expect(productionEdit(document, pack, "ore", null)).toEqual({
      commands: [{ type: "setRate", graph: "root", id: "ore", perSecond: null }],
      label: "Remove Cuprite Ore supply limit",
    });
  });
});
