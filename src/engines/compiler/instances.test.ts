import { describe, expect, it } from "vitest";
import type { Document } from "../../contracts/document";
import { definePlugin } from "../../contracts/plugin";
import { ok } from "../../contracts/result";
import type { Solution } from "../../contracts/solver";
import { compile } from "./compile";
import { findBlueprint } from "./instances";
import { toResults } from "./results";
import { platesModule, templatePack } from "./template.fixture";

const pack = templatePack();
const noPlugin = definePlugin({ id: "template" });

describe("compiling blueprints and their instances", () => {
  it("compiles every blueprint into the model and points instances and their edges at it", () => {
    const compiled = compile({ document: platesModule(), pack, plugin: noPlugin });
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.items).toEqual(["clean-ferrite", "iron-plate"]);
    expect(compiled.nodes).toEqual(["ferrite", "module", "out"]);
    expect(compiled.model).toEqual({
      items: 2,
      nodes: [
        { kind: "process", rates: [{ item: 0, perSecond: 1 }], cost: 1 },
        { kind: "instance", rates: [], cost: 0, blueprint: 0 },
        { kind: "process", rates: [{ item: 1, perSecond: -1 }], pin: 2, cost: 0 },
      ],
      edges: [
        { from: 0, to: 1, item: 0, toPort: 0 },
        { from: 1, to: 2, item: 1, fromPort: 1 },
      ],
      constraints: [],
      blueprints: [
        {
          // Port nodes as the solver sees them: the `in` port supplies, the `out` port takes.
          nodes: [
            { kind: "process", rates: [{ item: 0, perSecond: 1 }], cost: 0 },
            { kind: "process", rates: [{ item: 1, perSecond: -1 }], cost: 0 },
            {
              kind: "process",
              rates: [
                { item: 0, perSecond: -1 / 3 },
                { item: 1, perSecond: 1 / 3 },
              ],
              pin: 3,
              cost: 0,
            },
          ],
          edges: [
            { from: 0, to: 2, item: 0, capacity: 15 },
            { from: 2, to: 1, item: 1 },
          ],
          constraints: [],
          ports: [0, 1],
        },
      ],
    });
    expect(compiled.blueprints?.[0]).toMatchObject({
      graph: "plates",
      name: "Plates",
      nodes: ["in", "out", "smelt"],
      edges: ["in-smelt", "smelt-out"],
      items: ["clean-ferrite", "iron-plate"],
      ports: [0, 1],
    });
  });

  it("numbers items once for all graphs, in pack order", () => {
    const document = platesModule();
    const plates = document.blueprints.plates as Document["blueprints"][string];
    plates.graph.nodes.coal = { kind: "source", item: "coal" };
    const compiled = compile({ document, pack, plugin: noPlugin });
    expect(compiled.items).toEqual(["coal", "clean-ferrite", "iron-plate"]);
    expect(compiled.model.nodes[0]?.rates).toEqual([{ item: 1, perSecond: 1 }]);
    expect(compiled.model.blueprints?.[0]?.nodes[0]?.rates).toEqual([{ item: 0, perSecond: 1 }]);
  });

  it("reports instances it can't place and edges through ports they don't have", () => {
    const document = platesModule();
    document.graph.nodes.lost = { kind: "instance", blueprint: "nope" };
    document.graph.nodes.stray = { kind: "port", direction: "in", item: "coal" };
    document.graph.edges = {
      ...document.graph.edges,
      noPort: { from: "ferrite", to: "module", item: "clean-ferrite" },
      backwards: { from: "module", fromPort: "in", to: "out", item: "clean-ferrite" },
      wrongItem: { from: "module", fromPort: "out", to: "out", item: "clean-ferrite" },
    };
    const compiled = compile({ document, pack, plugin: noPlugin });
    expect(compiled.diagnostics).toEqual([
      { kind: "error", node: "lost", message: 'Unknown blueprint "nope"' },
      { kind: "error", node: "stray", message: "Ports belong inside blueprints" },
      { kind: "error", message: `Edge "backwards" uses "in", which isn't an out port of instance "module"` },
      { kind: "error", message: `Edge "noPort" reaches instance "module" without naming a port` },
      { kind: "error", message: `Edge "wrongItem" carries "clean-ferrite", but port "out" carries "iron-plate"` },
    ]);
    expect(compiled.edges).toEqual(["ferrite-module", "module-out"]);
  });

  it("refuses blueprints that place themselves", () => {
    const document = platesModule();
    const plates = document.blueprints.plates as Document["blueprints"][string];
    plates.graph.nodes.again = { kind: "instance", blueprint: "plates" };
    const compiled = compile({ document, pack, plugin: noPlugin });
    expect(compiled.diagnostics).toEqual([
      { kind: "error", node: "module", message: 'Blueprint "plates" contains itself' },
    ]);
    expect(compiled.model.blueprints).toBeUndefined();
  });

  it("gives byte-identical IR whatever order a blueprint's maps were built in", () => {
    const document = platesModule();
    const plates = document.blueprints.plates as Document["blueprints"][string];
    const reversed = <T>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).reverse());
    const shuffled: Document = {
      ...document,
      blueprints: {
        plates: { ...plates, graph: { nodes: reversed(plates.graph.nodes), edges: reversed(plates.graph.edges) } },
      },
    };
    expect(JSON.stringify(compile({ document: shuffled, pack, plugin: noPlugin }))).toBe(
      JSON.stringify(compile({ document, pack, plugin: noPlugin })),
    );
  });
});

describe("mapping instances back to the document", () => {
  const compiled = compile({ document: platesModule(), pack, plugin: noPlugin });
  /** What the solver answers: the module runs its design twice. */
  const solution: Solution = {
    activity: [2, 2, 2],
    flow: [2, 2],
    surplus: [],
    deficit: [],
    overflow: [],
    pinMisses: [],
    instances: [{ node: 1, ports: [2, 2], activity: [2, 2, 6] }],
  };

  it("gives an instance its scale and what crosses its ports", () => {
    const results = toResults(compiled, ok(solution), noPlugin, 1);
    expect(results.nodes.module).toEqual({
      activity: 2,
      inputs: { "clean-ferrite": 2 },
      outputs: { "iron-plate": 2 },
    });
  });

  it("counts the buildings inside instances in the totals", () => {
    const results = toResults(compiled, ok(solution), noPlugin, 1);
    expect(results.totals).toEqual({ raw: { "clean-ferrite": 2 }, buildings: { furnace: 6 } });
  });

  it("hints at blueprints solved inline", () => {
    const inlined = { ...solution, inlined: [{ blueprint: 0, freedom: 6 }] };
    expect(toResults(compiled, ok(inlined), noPlugin, 1).diagnostics).toEqual([
      {
        kind: "hint",
        node: "module",
        message:
          'Blueprint "Plates" can run in 6 independent ways, so it is solved inline, which is slower. ' +
          "Pin machines inside it to fix their ratios, and it compiles into a macro recipe.",
      },
    ]);
  });
});

describe("mapping a blueprint's inside back to its graph", () => {
  it("finds a blueprint by id with its index in the model", () => {
    const compiled = compile({ document: platesModule(), pack, plugin: noPlugin });
    expect(findBlueprint(compiled, "plates")?.index).toBe(0);
    expect(findBlueprint(compiled, "root")).toBeUndefined();
  });

  it("names the blueprint's own nodes and edges", () => {
    const compiled = compile({ document: platesModule(), pack, plugin: noPlugin });
    const plates = findBlueprint(compiled, "plates");
    if (!plates) throw new Error("expected the blueprint");
    // What expanding the instance answers: in, out, smelt.
    const inside: Solution = {
      activity: [2, 2, 6],
      flow: [2, 2],
      surplus: [],
      deficit: [],
      overflow: [{ edge: 0, perSecond: 1 }],
      pinMisses: [],
    };
    const results = toResults(plates.compiled, ok(inside), noPlugin, 4);
    expect([results.graph, results.version]).toEqual(["plates", 4]);
    expect(results.nodes.smelt?.activity).toBe(6);
    expect(results.nodes.in).toEqual({ activity: 2, inputs: {}, outputs: { "clean-ferrite": 2 } });
    expect(results.edges["in-smelt"]).toEqual({ perSecond: 2, capacity: 15 });
    expect(results.diagnostics).toEqual([{ kind: "overflow", edge: "in-smelt", perSecond: 1 }]);
    // Ports aren't raw inputs: they come from outside the blueprint.
    expect(results.totals).toEqual({ raw: {}, buildings: { furnace: 6 } });
  });
});
