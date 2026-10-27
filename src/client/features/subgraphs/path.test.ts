import { describe, expect, it } from "vitest";
import { Document } from "../../../contracts/document";
import { exampleDocument } from "../../../contracts/document.fixture";
import { PackData } from "../../../contracts/pack";
import { blueprintName, crumbsOf, graphOf, instancesOf, livePath, pathTo, scopedTo, type Crumb } from "./path";

const document = Document.parse(exampleDocument);
/** The fixture's rods blueprint holds an instance of a gears blueprint. */
const nested = Document.parse({
  ...exampleDocument,
  blueprints: {
    ...exampleDocument.blueprints,
    rods: {
      ...exampleDocument.blueprints.rods,
      graph: {
        ...exampleDocument.blueprints.rods.graph,
        nodes: { ...exampleDocument.blueprints.rods.graph.nodes, cell: { kind: "instance", blueprint: "gears" } },
      },
    },
    gears: { name: "Gears", graph: { nodes: {}, edges: {} } },
  },
});
const path: Crumb[] = [
  { instance: "rods", blueprint: "rods" },
  { instance: "cell", blueprint: "gears" },
];

describe("subgraph paths", () => {
  it("show the graph of the innermost blueprint, or the root graph", () => {
    expect(graphOf([])).toBe("root");
    expect(graphOf(path)).toBe("gears");
  });

  it("are cut where an instance no longer places its blueprint (expanded, deleted, undone)", () => {
    expect(livePath(nested, path)).toBe(path);
    expect(livePath(document, path)).toEqual([{ instance: "rods", blueprint: "rods" }]);
    const removed = {
      ...nested,
      graph: { ...nested.graph, nodes: { ore: { kind: "source", item: "x" } } },
    } as Document;
    expect(livePath(removed, path)).toEqual([]);
  });

  it("name each level for the breadcrumbs, the factory first", () => {
    expect(crumbsOf(nested, path)).toEqual([
      { label: "Iron", depth: 0 },
      { label: "Iron rods", depth: 1 },
      { label: "Gears", depth: 2 },
    ]);
  });

  it("lead from the root graph to a blueprint through the first instance found on the way", () => {
    expect(pathTo(nested, "root")).toEqual([]);
    expect(pathTo(nested, "rods")).toEqual([{ instance: "rods", blueprint: "rods" }]);
    expect(pathTo(nested, "gears")).toEqual(path);
    // Placed in the root graph too: the shorter way, through the first instance by id.
    const twice = Document.parse({
      ...nested,
      graph: {
        ...nested.graph,
        nodes: {
          ...nested.graph.nodes,
          "gears-b": { kind: "instance", blueprint: "gears" },
          "gears-a": { kind: "instance", blueprint: "gears" },
        },
      },
    });
    expect(pathTo(twice, "gears")).toEqual([{ instance: "gears-a", blueprint: "gears" }]);
    // Not placed anywhere (or only in a blueprint that isn't): no way there.
    expect(pathTo(document, "gears")).toBeUndefined();
    expect(pathTo(nested, "nothing")).toBeUndefined();
  });

  it("count a blueprint's instances in every graph", () => {
    expect(instancesOf(nested, "rods")).toBe(1);
    expect(instancesOf(nested, "gears")).toBe(1);
    expect(instancesOf(document, "nothing")).toBe(0);
  });
});

describe("scopedTo", () => {
  it("presents a blueprint's graph and layout as the document's own, for views that read the root graph", () => {
    const scoped = scopedTo(document, "rods");
    expect(scoped.graph).toBe(document.blueprints["rods"]?.graph);
    expect(scoped.layout["root"]).toBe(document.layout["rods"]);
    expect(scoped.blueprints).toBe(document.blueprints);
    expect(scopedTo(document, "root")).toBe(document);
  });
});

describe("blueprintName", () => {
  const pack = PackData.parse({
    items: [
      { id: "iron-ingot", name: "Iron Ingot", form: "solid" },
      { id: "slag", name: "Slag", form: "solid" },
    ],
    buildings: [{ id: "furnace", name: "Furnace" }],
    recipes: [{ id: "iron-ingot", buildings: ["furnace"], time: 1, in: {}, out: { "iron-ingot": 1 } }],
  });

  it("is named after what leaves the selection", () => {
    expect(blueprintName(document, pack, "root", ["smelt", "split"])).toBe("Iron Ingot line");
  });

  it("is named after what its machines make when nothing leaves it, and never twice the same", () => {
    const alone = { ...document, graph: { nodes: { smelt: { kind: "recipe", recipe: "iron-ingot" } }, edges: {} } };
    expect(blueprintName(alone as Document, pack, "root", ["smelt"])).toBe("Iron Ingot line");
    const taken = { ...document, blueprints: { x: { name: "Iron Ingot line", graph: { nodes: {}, edges: {} } } } };
    expect(blueprintName(taken, pack, "root", ["smelt"])).toBe("Iron Ingot line 2");
    expect(blueprintName(document, pack, "root", ["hint"])).toBe("Subgraph");
  });

  it("leaves byproducts out of the name when a main product leaves too", () => {
    const withSlag = {
      ...document,
      graph: {
        nodes: { smelt: document.graph.nodes["smelt"], a: { kind: "junction" }, b: { kind: "junction" } },
        edges: {
          a: { from: "smelt", to: "a", item: "slag" },
          b: { from: "smelt", to: "b", item: "iron-ingot" },
        },
      },
    } as Document;
    const slagToo = PackData.parse({
      ...pack,
      recipes: [{ id: "iron-ingot", buildings: ["furnace"], time: 1, in: {}, out: { "iron-ingot": 1, slag: 1 } }],
    });
    expect(blueprintName(withSlag, slagToo, "root", ["smelt"])).toBe("Iron Ingot line");
  });

  it("names two products, and an item the pack doesn't know by its id", () => {
    const twoWays = {
      ...document,
      graph: {
        nodes: { bus: { kind: "junction" }, a: { kind: "junction" }, b: { kind: "junction" } },
        edges: {
          x: { from: "bus", to: "a", item: "iron-ingot" },
          y: { from: "bus", to: "b", item: "slag" },
        },
      },
    } as Document;
    expect(blueprintName(twoWays, pack, "root", ["bus"])).toBe("Iron Ingot & Slag line");
    expect(blueprintName(document, pack, "rods", ["make"])).toBe("iron-rod line");
  });
});
