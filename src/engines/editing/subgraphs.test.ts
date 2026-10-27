import { freeze } from "immer";
import { describe, expect, it } from "vitest";
import { Document } from "../../contracts/document";
import { exampleDocument } from "../../contracts/document.fixture";
import { applyCommands, describeCommands, type ResolvedCommand } from "./commands";

const document = Document.parse(exampleDocument);

function edit(start: Document, ...commands: ResolvedCommand[]) {
  const result = applyCommands(start, commands);
  if (!result.ok) throw new Error(`Expected the edit to succeed: ${JSON.stringify(result.error)}`);
  return result.value.document;
}

function rejection(start: Document, ...commands: ResolvedCommand[]) {
  const result = applyCommands(start, commands);
  if (result.ok) throw new Error("Expected the edit to be rejected");
  return result.error;
}

const collapse = (ids: string[], extra: Partial<Extract<ResolvedCommand, { type: "collapse" }>> = {}) =>
  ({ type: "collapse", graph: "root", ids, blueprint: "sub", instance: "inst", name: "Smelting", ...extra }) as const;

/** Ore feeding two smelters, both feeding one merger that feeds a sink. */
const fanned = Document.parse({
  ...exampleDocument,
  graph: {
    nodes: {
      ore: { kind: "source", item: "iron-ore" },
      a: { kind: "recipe", recipe: "iron-ingot" },
      b: { kind: "recipe", recipe: "iron-ingot" },
      merge: { kind: "junction" },
      out: { kind: "sink", item: "iron-ingot" },
    },
    edges: {
      oa: { from: "ore", to: "a", item: "iron-ore", logistics: "belt-mk1" },
      ob: { from: "ore", to: "b", item: "iron-ore", logistics: "belt-mk1" },
      am: { from: "a", to: "merge", item: "iron-ingot" },
      bm: { from: "b", to: "merge", item: "iron-ingot", logistics: "belt-mk2" },
      mo: { from: "merge", to: "out", item: "iron-ingot" },
    },
  },
  blueprints: {},
  layout: {
    root: {
      ore: { x: 0, y: 0 },
      a: { x: 360, y: -96, tag: "red" },
      b: { x: 360, y: 96 },
      merge: { x: 720, y: 0 },
      out: { x: 960, y: 0 },
    },
  },
});

describe("collapsing nodes into a subgraph", () => {
  it("moves the nodes and their flows into a new blueprint, with an instance in their place", () => {
    const next = edit(document, collapse(["smelt", "split"]));
    expect(next.blueprints["sub"]).toEqual({
      name: "Smelting",
      graph: {
        nodes: {
          smelt: document.graph.nodes["smelt"],
          split: { kind: "junction" },
          "in-iron-ore": { kind: "port", direction: "in", item: "iron-ore" },
          "out-iron-ingot": { kind: "port", direction: "out", item: "iron-ingot" },
          "out-iron-ingot~2": { kind: "port", direction: "out", item: "iron-ingot" },
        },
        edges: {
          e1: { from: "in-iron-ore", to: "smelt", item: "iron-ore", logistics: "belt-mk1" },
          e2: { from: "smelt", to: "split", item: "iron-ingot" },
          // The share stays with the node it's a share of.
          e3: { from: "split", to: "out-iron-ingot", item: "iron-ingot", ratio: 0.5 },
          e4: { from: "split", to: "out-iron-ingot~2", item: "iron-ingot" },
        },
      },
    });
    expect(next.graph.nodes).not.toHaveProperty("smelt");
    expect(next.graph.nodes).not.toHaveProperty("split");
    expect(next.graph.nodes["inst"]).toEqual({ kind: "instance", blueprint: "sub" });
    expect(next.graph.edges).toEqual({
      e1: { from: "ore", to: "inst", toPort: "in-iron-ore", item: "iron-ore", logistics: "belt-mk1" },
      e3: { from: "inst", fromPort: "out-iron-ingot", to: "out", item: "iron-ingot" },
      e4: { from: "inst", fromPort: "out-iron-ingot~2", to: "rods", toPort: "in", item: "iron-ingot" },
    });
  });

  it("puts the instance at the selection's top-left corner and keeps the nodes' positions inside", () => {
    const next = edit(fanned, collapse(["a", "b", "merge"]));
    expect(next.layout["root"]?.["inst"]).toEqual({ x: 360, y: -96 });
    expect(next.layout["root"]).not.toHaveProperty("a");
    expect(next.layout["sub"]?.["a"]).toEqual({ x: 360, y: -96, tag: "red" });
    expect(next.layout["sub"]?.["merge"]).toEqual({ x: 720, y: 0 });
  });

  it("gives the flows of one item from one node one port, and keeps them apart inside", () => {
    const next = edit(fanned, collapse(["a", "b"]));
    const inside = next.blueprints["sub"]?.graph;
    expect(Object.keys(inside?.nodes ?? {}).filter((id) => inside?.nodes[id]?.kind === "port")).toEqual([
      "in-iron-ore",
      "out-iron-ingot",
    ]);
    // One flow from the ore to the instance, under the first flow's id; each smelter still has its own inside.
    expect(next.graph.edges["oa"]).toEqual({
      from: "ore",
      to: "inst",
      toPort: "in-iron-ore",
      item: "iron-ore",
      logistics: "belt-mk1",
    });
    expect(next.graph.edges).not.toHaveProperty("ob");
    expect(inside?.edges["oa"]).toEqual({ from: "in-iron-ore", to: "a", item: "iron-ore", logistics: "belt-mk1" });
    expect(inside?.edges["ob"]).toEqual({ from: "in-iron-ore", to: "b", item: "iron-ore", logistics: "belt-mk1" });
    // Two flows into one merger: one port; the belts differ, so the shared flow outside has none.
    expect(next.graph.edges["am"]).toEqual({
      from: "inst",
      fromPort: "out-iron-ingot",
      to: "merge",
      item: "iron-ingot",
    });
    expect(next.graph.edges).not.toHaveProperty("bm");
    expect(inside?.edges["bm"]).toEqual({ from: "b", to: "out-iron-ingot", item: "iron-ingot", logistics: "belt-mk2" });
  });

  it("lays the ports out beside the nodes: inputs left, outputs right", () => {
    const next = edit(fanned, collapse(["a", "b"], { bounds: { x: 360, y: -96, width: 312, height: 312 } }));
    const ports = next.layout["sub"] ?? {};
    const input = ports["in-iron-ore"];
    const output = ports["out-iron-ingot"];
    expect(input && input.x + 264).toBeLessThan(360);
    expect(output?.x).toBeGreaterThan(360 + 312);
    for (const position of [input, output]) {
      expect(position && position.x % 24).toBe(0);
      expect(position && position.y % 24).toBe(0);
    }
  });

  it("names the step after what it does", () => {
    expect(describeCommands([collapse(["a"])])).toBe("Collapse into subgraph");
  });

  it("refuses ports, unknown nodes, taken ids and the name root", () => {
    const inBlueprint = { ...collapse(["in", "make"]), graph: "rods" };
    expect(rejection(document, inBlueprint)).toEqual([
      { path: ["commands", 0, "ids", 0], message: "Ports can't be collapsed into a subgraph" },
    ]);
    expect(rejection(document, collapse(["nope"]))).toEqual([
      { path: ["commands", 0, "ids", 0], message: "Unknown node nope" },
    ]);
    expect(rejection(document, collapse(["smelt"], { blueprint: "rods" }))).toEqual([
      { path: ["commands", 0, "blueprint"], message: "Blueprint rods already exists" },
    ]);
    expect(rejection(document, collapse(["smelt"], { blueprint: "root" }))).toEqual([
      { path: ["commands", 0, "blueprint"], message: "A blueprint can't be called root" },
    ]);
    expect(rejection(document, collapse(["smelt"], { instance: "ore" }))).toEqual([
      { path: ["commands", 0, "instance"], message: "Node ore already exists" },
    ]);
  });

  it("collapses inside a blueprint too, through that blueprint's ports", () => {
    const next = edit(document, { ...collapse(["make"]), graph: "rods" });
    expect(next.blueprints["rods"]?.graph.nodes["inst"]).toEqual({ kind: "instance", blueprint: "sub" });
    expect(next.blueprints["rods"]?.graph.edges["a"]).toEqual({
      from: "in",
      to: "inst",
      toPort: "in-iron-ingot",
      item: "iron-ingot",
    });
  });
});

describe("expanding a subgraph instance", () => {
  it("leaves the expanded nodes editable in the same batch, though the document is frozen", () => {
    // Every document after the first edit is one Immer froze; the copies must not be those frozen originals.
    const frozen = freeze(structuredClone(document), true);
    const next = edit(
      frozen,
      { type: "expand", graph: "root", id: "rods" },
      { type: "setNodeFields", graph: "root", id: "make", fields: { clock: 150 } },
    );
    expect(next.graph.nodes["make"]).toMatchObject({ kind: "recipe", fields: { clock: 150 } });
    expect(frozen.blueprints["rods"]?.graph.nodes["make"]).not.toHaveProperty("fields");
  });

  it("undoes a collapse exactly", () => {
    for (const [start, ids] of [
      [document, ["smelt", "split"]],
      [fanned, ["a", "b"]],
      [fanned, ["a", "b", "merge"]],
      [fanned, ["ore", "a"]],
    ] as const) {
      const collapsed = edit(start, collapse([...ids]));
      expect(edit(collapsed, { type: "expand", graph: "root", id: "inst" })).toEqual(start);
    }
  });

  it("puts the blueprint's nodes where the instance is and reconnects its flows", () => {
    const moved = edit(document, {
      type: "moveNodes",
      graph: "root",
      positions: { rods: { x: 100, y: 200 } },
    });
    const next = edit(moved, { type: "expand", graph: "root", id: "rods" });
    expect(next.graph.nodes["make"]).toEqual({ kind: "recipe", recipe: "iron-rod" });
    expect(next.graph.nodes).not.toHaveProperty("rods");
    expect(next.graph.nodes).not.toHaveProperty("in");
    // The split fed the instance's port; it feeds the rod machine now, under the inside flow's id.
    expect(next.graph.edges["a"]).toEqual({ from: "split", to: "make", item: "iron-ingot" });
    expect(next.graph.edges).not.toHaveProperty("e4");
    // Its last instance gone, the blueprint dissolves.
    expect(next.blueprints).toEqual({});
    expect(next.layout).not.toHaveProperty("rods");
  });

  it("keeps the blueprint while other instances use it, and renames what clashes", () => {
    const twice = edit(document, {
      type: "addNode",
      graph: "root",
      id: "rods2",
      node: { kind: "instance", blueprint: "rods" },
      position: { x: 0, y: 500 },
    });
    const once = edit(twice, { type: "expand", graph: "root", id: "rods" });
    expect(once.blueprints["rods"]).toEqual(document.blueprints["rods"]);
    const both = edit(once, { type: "expand", graph: "root", id: "rods2" });
    expect(both.graph.nodes["make~2"]).toEqual({ kind: "recipe", recipe: "iron-rod" });
    expect(both.blueprints).toEqual({});
  });

  it("joins the flows around a blueprint that passes an item straight through", () => {
    const bus = edit(
      document,
      {
        type: "addNode",
        graph: "rods",
        id: "spare",
        node: { kind: "port", direction: "out", item: "iron-ingot" },
        position: { x: 0, y: 0 },
      },
      // The ingots that enter also leave unchanged, through a second output.
      { type: "connect", graph: "rods", id: "pass", edge: { from: "in", to: "spare", item: "iron-ingot" } },
      {
        type: "connect",
        graph: "root",
        id: "onward",
        edge: { from: "rods", fromPort: "spare", to: "out", item: "iron-ingot" },
      },
    );
    const next = edit(bus, { type: "expand", graph: "root", id: "rods" });
    expect(next.graph.edges["e4+onward"]).toEqual({ from: "split", to: "out", item: "iron-ingot" });
    for (const edge of Object.values(next.graph.edges)) {
      expect(next.graph.nodes).toHaveProperty([edge.from]);
      expect(next.graph.nodes).toHaveProperty([edge.to]);
    }
  });

  it("refuses what isn't an instance", () => {
    expect(rejection(document, { type: "expand", graph: "root", id: "smelt" })).toEqual([
      { path: ["commands", 0, "id"], message: "smelt is not a subgraph instance" },
    ]);
  });
});

describe("renaming a blueprint", () => {
  it("changes its name", () => {
    const next = edit(document, { type: "renameBlueprint", blueprint: "rods", name: "Rods" });
    expect(next.blueprints["rods"]?.name).toBe("Rods");
  });

  it("refuses an unknown blueprint", () => {
    expect(rejection(document, { type: "renameBlueprint", blueprint: "nope", name: "X" })).toEqual([
      { path: ["commands", 0, "blueprint"], message: "Unknown blueprint nope" },
    ]);
  });
});
