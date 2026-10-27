import { describe, expect, it, vi } from "vitest";
import type { Graph } from "../../../contracts/document";
import { PackData } from "../../../contracts/pack";
import { applyPick, filterEntries, pickCommands, pickerEntries, placeNode, recipeUsage } from "./picker";

const pack = PackData.parse({
  items: [
    { id: "ore", name: "Ferrite Ore", form: "solid" },
    { id: "plate", name: "Iron Plate", form: "solid" },
    { id: "gear", name: "Iron Gear", form: "solid", aliases: ["cog"] },
    { id: "slag", name: "Slag", form: "solid" },
  ],
  buildings: [
    { id: "furnace", name: "Furnace" },
    { id: "assembler", name: "Assembler" },
  ],
  recipes: [
    { id: "smelt", name: "Iron Plate", buildings: ["furnace"], time: 2, in: { ore: 1 }, out: { plate: 1 } },
    { id: "smelt-dirty", buildings: ["furnace"], time: 2, in: { ore: 2 }, out: { slag: 1, plate: 1 } },
    {
      id: "smelt-alt",
      name: "Iron Plate (Alternate)",
      buildings: ["furnace"],
      time: 2,
      in: { ore: 1 },
      out: { plate: 2 },
      tags: ["alternate"],
    },
    { id: "gears", name: "Iron Gear", buildings: ["assembler"], time: 1, in: { plate: 2 }, out: { gear: 1 } },
  ],
  resources: [{ item: "ore" }],
});

const ids = (entries: ReturnType<typeof pickerEntries>) => entries.map((entry) => entry.id);

describe("pickerEntries", () => {
  it("offers the recipes that consume an item dragged from an output, and a way out of the graph", () => {
    expect(ids(pickerEntries(pack, { item: "plate", side: "out" }, {}))).toEqual(["gears", "sink:plate"]);
  });

  it("offers the recipes that produce an item dragged from an input, then a source", () => {
    expect(ids(pickerEntries(pack, { item: "plate", side: "in" }, {}))).toEqual([
      "smelt",
      "smelt-alt",
      "smelt-dirty",
      "source:plate",
    ]);
  });

  it("puts a source first for raw resources", () => {
    expect(ids(pickerEntries(pack, { item: "ore", side: "in" }, {}))).toEqual(["source:ore"]);
  });

  it("ranks the recipes used most in the document first", () => {
    const ranked = ids(pickerEntries(pack, { item: "plate", side: "in" }, { "smelt-alt": 3, "smelt-dirty": 1 }));
    expect(ranked).toEqual(["smelt-alt", "smelt-dirty", "smelt", "source:plate"]);
  });

  it("ranks recipes that make the item as their main product, alternates included, above byproduct makers", () => {
    const recipes = ids(pickerEntries(pack, { item: "plate", side: "in" }, {})).slice(0, 3);
    expect(recipes.at(-1)).toBe("smelt-dirty");
  });

  it("describes a recipe with its building and its inputs and outputs", () => {
    const [gears] = pickerEntries(pack, { item: "plate", side: "out" }, {});
    expect(gears).toMatchObject({
      kind: "recipe",
      title: "Iron Gear",
      building: "Assembler",
      alternate: false,
      inputs: [{ item: { id: "plate", name: "Iron Plate" }, perSecond: 2 }],
      outputs: [{ item: { id: "gear", name: "Iron Gear" }, perSecond: 1 }],
    });
  });
});

describe("filterEntries", () => {
  const entries = pickerEntries(pack, { item: "plate", side: "in" }, {});

  it("keeps the order and matches every word against names, buildings and items", () => {
    expect(ids(filterEntries(entries, "alt"))).toEqual(["smelt-alt"]);
    expect(ids(filterEntries(entries, "furnace slag"))).toEqual(["smelt-dirty"]);
    expect(ids(filterEntries(entries, "  "))).toEqual(ids(entries));
  });

  it("matches item aliases", () => {
    const consumers = pickerEntries(pack, { item: "plate", side: "out" }, {});
    expect(ids(filterEntries(consumers, "cog"))).toEqual(["gears"]);
  });
});

describe("recipeUsage", () => {
  it("counts the nodes running each recipe", () => {
    const graph: Graph = {
      nodes: {
        a: { kind: "recipe", recipe: "smelt" },
        b: { kind: "recipe", recipe: "smelt" },
        c: { kind: "recipe", recipe: "gears" },
        d: { kind: "source", item: "ore" },
      },
      edges: {},
    };
    expect(recipeUsage(graph)).toEqual({ smelt: 2, gears: 1 });
  });
});

describe("placeNode", () => {
  it("puts a consumer's matching input port at the drop point, snapped to the grid horizontally", () => {
    const [gears] = pickerEntries(pack, { item: "plate", side: "out" }, {});
    if (!gears) throw new Error("no entry");
    const at = placeNode(pack, gears, { item: "plate", side: "out" }, { x: 500, y: 300 });
    expect(at.x).toBe(504);
    expect(at.portY).toBe(300);
  });

  it("puts a producer to the left of the drop point, with its output port there", () => {
    const [smelt] = pickerEntries(pack, { item: "plate", side: "in" }, {});
    if (!smelt) throw new Error("no entry");
    const at = placeNode(pack, smelt, { item: "plate", side: "in" }, { x: 500, y: 300 });
    expect(at.x + at.width).toBeCloseTo(500, -2);
    expect(at.portY).toBe(300);
  });
});

describe("applyPick", () => {
  it("sends the batch to the editing manager with a label naming what was added", async () => {
    const apply = vi.fn().mockResolvedValue({ ok: true, value: { id: "doc", name: "", packId: "p", version: 2 } });
    const [gears] = pickerEntries(pack, { item: "plate", side: "out" }, {});
    if (!gears) throw new Error("no entry");
    const pick = {
      graph: "root",
      from: { node: "smelter", item: "plate", side: "out" as const },
      entry: gears,
      drop: { x: 0, y: 0 },
      id: "n",
    };

    await applyPick({ apply }, "doc", pack, pick);

    expect(apply).toHaveBeenCalledWith({
      documentId: "doc",
      commands: pickCommands(pack, pick),
      label: "Add Iron Gear",
    });
  });
});

describe("pickCommands", () => {
  it("connects through the port of the subgraph instance it was dragged from", () => {
    const [gears] = pickerEntries(pack, { item: "plate", side: "out" }, {});
    const [smelt] = pickerEntries(pack, { item: "ore", side: "in" }, {});
    if (!gears || !smelt) throw new Error("no entry");
    const fromOutput = { graph: "root", entry: gears, drop: { x: 500, y: 300 }, id: "new" };
    expect(
      pickCommands(pack, { ...fromOutput, from: { node: "line", item: "plate", side: "out", port: "out-plate" } })[1],
    ).toEqual({
      type: "connect",
      graph: "root",
      edge: { from: "line", fromPort: "out-plate", to: "new", item: "plate" },
    });
    const intoInput = { graph: "root", entry: smelt, drop: { x: 0, y: 0 }, id: "new" };
    expect(
      pickCommands(pack, { ...intoInput, from: { node: "line", item: "ore", side: "in", port: "in-ore" } })[1],
    ).toEqual({ type: "connect", graph: "root", edge: { from: "new", to: "line", toPort: "in-ore", item: "ore" } });
  });

  it("adds the node and connects it to the port it was dragged from, as one batch", () => {
    const [gears] = pickerEntries(pack, { item: "plate", side: "out" }, {});
    if (!gears) throw new Error("no entry");
    const commands = pickCommands(pack, {
      graph: "root",
      from: { node: "smelter", item: "plate", side: "out" },
      entry: gears,
      drop: { x: 500, y: 300 },
      id: "new-node",
    });
    expect(commands).toEqual([
      {
        type: "addNode",
        graph: "root",
        id: "new-node",
        node: { kind: "recipe", recipe: "gears" },
        position: { x: 504, y: expect.any(Number) },
      },
      { type: "connect", graph: "root", edge: { from: "smelter", to: "new-node", item: "plate" } },
    ]);
  });

  it("connects a new producer into the input it was dragged from", () => {
    const sources = pickerEntries(pack, { item: "ore", side: "in" }, {});
    const [source] = sources;
    if (!source) throw new Error("no entry");
    const commands = pickCommands(pack, {
      graph: "root",
      from: { node: "smelter", item: "ore", side: "in" },
      entry: source,
      drop: { x: 0, y: 0 },
      id: "mine",
    });
    expect(commands[0]).toMatchObject({ node: { kind: "source", item: "ore" } });
    expect(commands[1]).toEqual({
      type: "connect",
      graph: "root",
      edge: { from: "mine", to: "smelter", item: "ore" },
    });
  });
});
