import { describe, expect, it } from "vitest";
import { ok, fail } from "../../contracts/result";
import { definePlugin } from "../../contracts/plugin";
import type { Solution } from "../../contracts/solver";
import { compile } from "./compile";
import { toResults } from "./results";
import { templatePack, waterLoop } from "./template.fixture";

const pack = templatePack();
const noPlugin = definePlugin({ id: "template" });
const compiled = compile({ document: waterLoop(), pack, plugin: noPlugin });

/** What the solver answers for the water loop (model order: merge ore plates purify smelt wash water). */
const solution: Solution = {
  activity: [0.5, 1, 1, 0.5, 3, 1, 0.125],
  // merge-wash ore-wash purify-merge smelt-plates wash-purify wash-smelt water-merge
  flow: [0.5, 1, 0.375, 1, 0.5, 1, 0.125],
  surplus: [{ node: 3, item: 3, perSecond: 0.125 }],
  deficit: [],
  overflow: [],
  pinMisses: [],
};

describe("mapping a solution back to the document", () => {
  const results = toResults(compiled, ok(solution), noPlugin, 7);

  it("names the document, version and graph", () => {
    expect([results.documentId, results.version, results.graph]).toEqual(["doc-water", 7, "root"]);
  });

  it("gives every node its activity and what it takes and makes", () => {
    expect(results.nodes.wash).toEqual({
      activity: 1,
      inputs: { "ferrite-ore": 1, water: 0.5 },
      outputs: { "dirty-water": 0.5, "clean-ferrite": 1 },
    });
    expect(results.nodes.smelt?.activity).toBe(3);
    expect(results.nodes.ore).toEqual({ activity: 1, inputs: {}, outputs: { "ferrite-ore": 1 } });
    expect(results.nodes.merge).toEqual({ activity: 0.5, inputs: { water: 0.5 }, outputs: { water: 0.5 } });
    expect(results.nodes.hint).toBeUndefined();
  });

  it("gives every edge its flow and capacity", () => {
    expect(results.edges["ore-wash"]).toEqual({ perSecond: 1, capacity: 15 });
    expect(results.edges["purify-merge"]).toEqual({ perSecond: 0.375 });
  });

  it("turns slacks into diagnostics on the right nodes, items and edges", () => {
    const strained: Solution = {
      ...solution,
      deficit: [{ node: 5, item: 0, perSecond: 0.25 }],
      overflow: [{ edge: 1, perSecond: 2 }],
      pinMisses: [{ node: 2, difference: -0.5 }],
    };
    expect(toResults(compiled, ok(strained), noPlugin, 7).diagnostics).toEqual([
      { kind: "surplus", node: "purify", item: "sludge", perSecond: 0.125 },
      { kind: "deficit", node: "wash", item: "ferrite-ore", perSecond: 0.25 },
      { kind: "overflow", edge: "ore-wash", perSecond: 2 },
      { kind: "pinMiss", node: "plates", difference: -0.5 },
    ]);
  });

  it("reports pin misses of rate pins in items per second", () => {
    const pinned = compile({
      document: {
        ...waterLoop(),
        graph: {
          nodes: {
            smelt: { kind: "recipe", recipe: "iron-plate", pin: { type: "rate", item: "iron-plate", perSecond: 2 } },
          },
          edges: {},
        },
      },
      pack,
      plugin: noPlugin,
    });
    const missed: Solution = {
      ...solution,
      activity: [3],
      flow: [],
      surplus: [],
      pinMisses: [{ node: 0, difference: -3 }],
    };
    expect(toResults(pinned, ok(missed), noPlugin, 1).diagnostics).toEqual([
      { kind: "pinMiss", node: "smelt", difference: -1 },
    ]);
  });

  it("totals raw inputs and buildings, rounding machines up", () => {
    expect(results.totals).toEqual({
      raw: { "ferrite-ore": 1, water: 0.125 },
      buildings: { furnace: 3, purifier: 1, washer: 1 },
    });
  });

  it("keeps the compiler's diagnostics", () => {
    const broken = compile({
      document: { ...waterLoop(), graph: { nodes: { x: { kind: "recipe", recipe: "nope" } }, edges: {} } },
      pack,
      plugin: noPlugin,
    });
    const empty: Solution = { activity: [], flow: [], surplus: [], deficit: [], overflow: [], pinMisses: [] };
    expect(toResults(broken, ok(empty), noPlugin, 1).diagnostics).toEqual([
      { kind: "error", node: "x", message: 'Unknown recipe "nope"' },
    ]);
  });

  it("reports an unsolvable model as an error and no numbers", () => {
    const unsolved = toResults(compiled, fail("infeasible"), noPlugin, 7);
    expect(unsolved.nodes).toEqual({});
    expect(unsolved.diagnostics).toEqual([
      { kind: "error", message: "The pack's constraints contradict each other; nothing could be solved" },
    ]);
  });

  it("asks the plugin for derived metrics of recipe nodes", () => {
    const power = definePlugin({
      id: "power",
      derive: ({ building, machines }) => ({ powerMW: (building.power?.consume ?? 0) * machines }),
    });
    const derived = toResults(compile({ document: waterLoop(), pack, plugin: power }), ok(solution), power, 7);
    expect(derived.nodes.smelt?.derived).toEqual({ powerMW: 1.5 });
    expect(derived.nodes.ore?.derived).toBeUndefined();
  });
});
