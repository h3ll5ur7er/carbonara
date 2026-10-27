import { describe, expect, it } from "vitest";
import { Document } from "../../../contracts/document";
import { PackData } from "../../../contracts/pack";
import type { PluginDescription } from "../../../contracts/plugin";
import type { AnalysisResults } from "../../../contracts/results";
import { inspectNode, inspectSelection, productionEdit } from "./inspect";

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

  it("reads the machine count the way the document's rounding setting says", () => {
    const smelt = { activity: 4.375, inputs: { ore: 2.9 }, outputs: { plate: 1.46 } };
    const partial = { ...results, nodes: { ...results.nodes, smelt } };
    const even = { ...document, settings: { machineGroups: "even" as const } };
    expect(inspectNode({ document, pack, results: partial, nodeId: "smelt" })?.subtitle).toBe(
      "Furnace · 4 × 100% + 1 × 37.5%",
    );
    expect(inspectNode({ document: even, pack, results: partial, nodeId: "smelt" })?.subtitle).toBe(
      "Furnace · 5 × 87.5%",
    );
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

  describe("a subgraph instance", () => {
    const placed = Document.parse({
      ...document,
      graph: {
        nodes: { line: { kind: "instance", blueprint: "cell" }, line2: { kind: "instance", blueprint: "cell" } },
        edges: {},
      },
      blueprints: {
        cell: {
          name: "Copper cell",
          graph: {
            nodes: {
              "in-ore": { kind: "port", direction: "in", item: "ore" },
              smelt: { kind: "recipe", recipe: "copper-plate" },
              "out-plate": { kind: "port", direction: "out", item: "plate" },
            },
            edges: {},
          },
        },
        // Places the cell once more, out of sight of the root graph.
        bigger: { name: "Bigger", graph: { nodes: { inner: { kind: "instance", blueprint: "cell" } }, edges: {} } },
      },
    });
    const solved: AnalysisResults = {
      ...results,
      nodes: { line: { activity: 2.5, inputs: { ore: 4 }, outputs: { plate: 2 } } },
      diagnostics: [{ kind: "error", node: "line", message: "Blueprint Copper cell places itself" }],
    };

    it("shows its blueprint's name, how often it's placed, its scale and its ports' rates", () => {
      expect(inspectNode({ document: placed, pack, results: solved, nodeId: "line" })).toMatchObject({
        title: "Copper cell",
        subtitle: "Subgraph · placed 3 times",
        fields: {},
        problems: [{ kind: "error", message: "Blueprint Copper cell places itself" }],
        instance: {
          blueprint: "cell",
          name: "Copper cell",
          rateUnit: "per_minute",
          scale: 2.5,
          solved: true,
          siblings: ["line", "line2"],
          ports: [
            { port: "in-ore", direction: "in", item: { id: "ore", name: "Cuprite Ore" }, perSecond: 4 },
            { port: "out-plate", direction: "out", item: { id: "plate", name: "Copper Plate" }, perSecond: 2 },
          ],
        },
      });
    });

    it("has no scale while it does what its ports need, and no rates before the solve", () => {
      const sized = { ...solved, nodes: { line: { activity: 0, inputs: {}, outputs: {} } } };
      expect(inspectNode({ document: placed, pack, results: sized, nodeId: "line" })?.instance).toMatchObject({
        scale: undefined,
        solved: true,
      });
      const unsolved = inspectNode({ document: placed, pack, results: null, nodeId: "line" })?.instance;
      expect(unsolved).toMatchObject({ solved: false, scale: undefined });
      expect(unsolved?.ports.map((port) => port.perSecond)).toEqual([undefined, undefined]);
    });

    it("counts instances in the whole factory when the document is scoped to a blueprint", () => {
      const scoped = { ...placed, graph: placed.blueprints.bigger?.graph ?? placed.graph };
      expect(inspectNode({ document: scoped, factory: placed, pack, results: null, nodeId: "inner" })).toMatchObject({
        subtitle: "Subgraph · placed 3 times",
        instance: { siblings: ["inner"] },
      });
    });

    it("says when it's the only one", () => {
      const once = Document.parse({
        ...placed,
        graph: { nodes: { line: placed.graph.nodes.line }, edges: {} },
        blueprints: { cell: placed.blueprints.cell },
      });
      expect(inspectNode({ document: once, pack, results: null, nodeId: "line" })?.subtitle).toBe(
        "Subgraph · placed once",
      );
    });
  });
});

describe("inspectSelection", () => {
  const clock = { kind: "number", label: "Clock speed", min: 1, max: 250, unit: "%", default: 100 } as const;
  const somersloop = { kind: "toggle", label: "Somersloop", default: false } as const;
  const twoBuildings = PackData.parse({
    ...pack,
    buildings: [
      { id: "furnace", name: "Furnace" },
      { id: "foundry", name: "Foundry" },
    ],
    recipes: [{ id: "copper-plate", buildings: ["furnace", "foundry"], time: 3, in: { ore: 2 }, out: { plate: 1 } }],
  });
  const plugin: PluginDescription = {
    nodeFields: { furnace: { clock, somersloop }, foundry: { clock } },
    settingsFields: {},
    metrics: {},
  };
  const selected = structuredClone(document);
  selected.graph.nodes.smelt = { kind: "recipe", recipe: "copper-plate", fields: { clock: 150, somersloop: true } };
  selected.graph.nodes.free = { kind: "recipe", recipe: "copper-plate", fields: { clock: 150 } };
  selected.graph.nodes.cast = { kind: "recipe", recipe: "copper-plate", building: "foundry", fields: { clock: 80 } };

  const inspectMany = (nodeIds: string[]) =>
    inspectSelection({ document: selected, pack: twoBuildings, results, nodeIds, plugin });

  it("offers the fields every selected machine has, with the value they share", () => {
    expect(inspectMany(["smelt", "free"])).toMatchObject({
      title: "2 machines",
      subtitle: "2 × Furnace",
      fields: { clock, somersloop },
      values: { clock: 150 },
      mixed: ["somersloop"],
    });
  });

  it("leaves out fields some of them don't have, and marks values that differ", () => {
    const inspected = inspectMany(["smelt", "free", "cast"]);
    expect(inspected).toMatchObject({ subtitle: "2 × Furnace · 1 × Foundry", fields: { clock }, mixed: ["clock"] });
    expect(inspected?.fields).not.toHaveProperty("somersloop");
    expect(inspected?.values).toEqual({});
  });

  it("has nothing to set when the selection holds more than machines", () => {
    expect(inspectMany(["smelt", "ore", "out"])).toMatchObject({ title: "3 nodes", fields: {} });
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
