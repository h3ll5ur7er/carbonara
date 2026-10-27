import { describe, expect, it } from "vitest";
import type { Document, Graph } from "../../../contracts/document";
import { PackData } from "../../../contracts/pack";
import { createSceneBuilder, handleId, type NodeView } from "./scene";

const pack = PackData.parse({
  units: { rate: "per_second" },
  items: [
    { id: "ore", name: "Ferrite Ore", form: "solid" },
    { id: "water", name: "Water", form: "fluid" },
    { id: "plate", name: "Iron Plate", form: "solid" },
    { id: "slag", name: "Slag", form: "solid" },
  ],
  buildings: [{ id: "furnace", name: "Furnace" }],
  recipes: [
    {
      id: "smelt",
      name: "Iron Plate",
      buildings: ["furnace"],
      time: 2,
      in: { ore: 2, water: 1 },
      out: { plate: 1, slag: 1 },
    },
    { id: "smelt-alt", buildings: ["furnace"], time: 2, in: { ore: 1 }, out: { plate: 1 }, tags: ["alternate"] },
  ],
});

const graph: Graph = {
  nodes: {
    mine: { kind: "source", item: "ore", maxPerSecond: 4 },
    smelter: { kind: "recipe", recipe: "smelt" },
    split: { kind: "junction" },
    goal: { kind: "sink", item: "plate", targetPerSecond: 1 },
    memo: { kind: "note", text: "Hello" },
    area: { kind: "frame", label: "Smelting" },
  },
  edges: {
    a: { from: "mine", to: "smelter", item: "ore" },
    b: { from: "smelter", to: "split", item: "plate" },
    c: { from: "split", to: "goal", item: "plate" },
  },
};
const positions = {
  mine: { x: 0, y: 0 },
  smelter: { x: 300, y: 0 },
  area: { x: -24, y: -24, width: 600, height: 400 },
};

function build(input: Graph = graph) {
  return createSceneBuilder()(input, positions, pack);
}

describe("buildScene", () => {
  it("gives a recipe node the recipe's inputs and outputs as ports, named from the pack", () => {
    const smelter = build().nodes.find((node) => node.id === "smelter");
    expect(smelter).toMatchObject({
      kind: "recipe",
      title: "Iron Plate",
      building: { id: "furnace", name: "Furnace" },
    });
    expect(smelter?.ports.map((port) => [port.direction, port.item.name, port.item.form])).toEqual([
      ["in", "Ferrite Ore", "solid"],
      ["in", "Water", "fluid"],
      ["out", "Iron Plate", "solid"],
      ["out", "Slag", "solid"],
    ]);
  });

  it("names a recipe without a name after its first output and marks alternates", () => {
    const scene = build({ nodes: { alt: { kind: "recipe", recipe: "smelt-alt" } }, edges: {} });
    expect(scene.nodes[0]).toMatchObject({ title: "Iron Plate", alternate: true });
  });

  it("stacks ports in rows, inputs first on the left edge, then outputs on the right", () => {
    const smelter = build().nodes.find((node) => node.id === "smelter");
    if (!smelter) throw new Error("missing node");
    const [ore, water, plate, slag] = smelter.ports;
    expect([ore?.x, water?.x, plate?.x, slag?.x]).toEqual([0, 0, smelter.width, smelter.width]);
    const rows = [ore?.y ?? 0, water?.y ?? 0, plate?.y ?? 0, slag?.y ?? 0];
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
    expect(new Set(rows).size).toBe(4);
    expect(smelter.height).toBeGreaterThan(rows[3] ?? Infinity);
  });

  it("gives sources one output, sinks one input and junctions one of each", () => {
    const nodes = build().nodes;
    const ports = (id: string) => nodes.find((node) => node.id === id)?.ports.map((port) => port.handle);
    expect(ports("mine")).toEqual([handleId("out", "ore")]);
    expect(ports("goal")).toEqual([handleId("in", "plate")]);
    expect(ports("split")).toEqual(["in", "out"]);
    expect(ports("memo")).toEqual([]);
  });

  it("shows the item a junction carries", () => {
    const split = build().nodes.find((node) => node.id === "split");
    expect(split).toMatchObject({ kind: "junction", item: { id: "plate" } });
  });

  it("connects edges to the ports of their item", () => {
    expect(build().edges).toEqual([
      { id: "a", source: "mine", target: "smelter", sourceHandle: "out:ore", targetHandle: "in:ore", item: "ore" },
      { id: "b", source: "smelter", target: "split", sourceHandle: "out:plate", targetHandle: "in", item: "plate" },
      { id: "c", source: "split", target: "goal", sourceHandle: "out", targetHandle: "in:plate", item: "plate" },
    ]);
  });

  it("leaves out edges whose ends have no port for their item", () => {
    const broken: Graph = { ...graph, edges: { x: { from: "mine", to: "smelter", item: "plate" } } };
    expect(build(broken).edges).toEqual([]);
  });

  it("takes positions and frame sizes from the layout, and puts frames behind everything", () => {
    const nodes = build().nodes;
    expect(nodes[0]).toMatchObject({
      id: "area",
      kind: "frame",
      position: { x: -24, y: -24 },
      width: 600,
      height: 400,
    });
    expect(nodes.find((node) => node.id === "smelter")?.position).toEqual({ x: 300, y: 0 });
  });

  it("falls back to the id for things the pack does not know", () => {
    const scene = build({ nodes: { odd: { kind: "recipe", recipe: "mystery" } }, edges: {} });
    expect(scene.nodes[0]).toMatchObject({ kind: "recipe", title: "mystery", ports: [] });
  });

  it("reuses the views of nodes that did not change, so their components need not render again", () => {
    const builder = createSceneBuilder();
    const first = builder(graph, positions, pack);
    const moved = builder(graph, { ...positions, mine: { x: 48, y: 0 } }, pack);
    const byId = (scene: typeof first, id: string) => scene.nodes.find((node) => node.id === id);
    expect(byId(moved, "smelter")).toBe(byId(first, "smelter"));
    expect(byId(moved, "mine")).not.toBe(byId(first, "mine"));
  });

  describe("subgraphs", () => {
    const blueprints: Document["blueprints"] = {
      line: {
        name: "Plate line",
        graph: {
          nodes: {
            "in-water": { kind: "port", direction: "in", item: "water" },
            "in-ore": { kind: "port", direction: "in", item: "ore" },
            smelter: { kind: "recipe", recipe: "smelt" },
            "out-plate": { kind: "port", direction: "out", item: "plate" },
          },
          edges: {},
        },
      },
    };
    // Inside, the water comes in below the ore: the card lists the inputs in that order.
    const subgraphs = {
      blueprints,
      layout: { line: { "in-ore": { x: 0, y: 0 }, "in-water": { x: 0, y: 96 } } },
    };
    const placed: Graph = {
      nodes: { mine: graph.nodes["mine"] as Graph["nodes"][string], line: { kind: "instance", blueprint: "line" } },
      edges: { a: { from: "mine", to: "line", toPort: "in-ore", item: "ore" } },
    };
    const instanceOf = (nodes: NodeView[]) => nodes.find((node) => node.id === "line");

    it("draws an instance as its blueprint, with a port for each of its port nodes", () => {
      const line = instanceOf(createSceneBuilder()(placed, positions, pack, subgraphs).nodes);
      expect(line).toMatchObject({ kind: "instance", blueprint: "line", title: "Plate line" });
      expect(line?.ports.map((port) => [port.direction, port.item.name, port.port, port.handle])).toEqual([
        ["in", "Ferrite Ore", "in-ore", "in:ore#in-ore"],
        ["in", "Water", "in-water", "in:water#in-water"],
        ["out", "Iron Plate", "out-plate", "out:plate#out-plate"],
      ]);
      const [ore, water, plate] = line?.ports ?? [];
      expect([ore?.x, water?.x, plate?.x]).toEqual([0, 0, line?.width]);
    });

    it("connects edges to an instance through the port they name", () => {
      expect(createSceneBuilder()(placed, positions, pack, subgraphs).edges).toEqual([
        {
          id: "a",
          source: "mine",
          target: "line",
          sourceHandle: "out:ore",
          targetHandle: "in:ore#in-ore",
          item: "ore",
        },
      ]);
    });

    it("draws a blueprint's ports as its boundary: an input passes its item on into the blueprint", () => {
      const inside = blueprints["line"]?.graph as Graph;
      const nodes = createSceneBuilder()(inside, undefined, pack, subgraphs).nodes;
      expect(nodes.find((node) => node.id === "in-ore")).toMatchObject({
        kind: "port",
        direction: "in",
        item: { id: "ore" },
        ports: [{ direction: "out", handle: "out:ore" }],
      });
      expect(nodes.find((node) => node.id === "out-plate")).toMatchObject({
        kind: "port",
        direction: "out",
        ports: [{ direction: "in", handle: "in:plate" }],
      });
    });

    it("draws an instance of a missing blueprint without ports", () => {
      const line = instanceOf(createSceneBuilder()(placed, positions, pack).nodes);
      expect(line).toMatchObject({ kind: "instance", title: "line", ports: [] });
    });

    it("rebuilds an instance when its blueprint changes, and only then", () => {
      const builder = createSceneBuilder();
      const first = instanceOf(builder(placed, positions, pack, subgraphs).nodes);
      expect(instanceOf(builder(placed, positions, pack, { ...subgraphs }).nodes)).toBe(first);
      const renamed = {
        ...subgraphs,
        blueprints: { line: { ...(blueprints["line"] as Document["blueprints"][string]), name: "Plates" } },
      };
      expect(instanceOf(builder(placed, positions, pack, renamed).nodes)).toMatchObject({ title: "Plates" });
    });
  });
});
