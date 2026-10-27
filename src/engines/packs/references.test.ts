import { describe, expect, it } from "vitest";
import { PackData } from "../../contracts/pack";
import { checkReferences } from "./references";

const base = PackData.parse({
  items: [
    { id: "ore", name: "Ore", form: "solid" },
    { id: "plate", name: "Plate", form: "solid" },
  ],
  buildings: [{ id: "furnace", name: "Furnace" }],
  recipes: [{ id: "plate", buildings: ["furnace"], time: 1, in: { ore: 1 }, out: { plate: 1 } }],
  resources: [{ item: "ore", extractors: ["furnace"] }],
});

const withChange = (change: Partial<Record<keyof PackData, unknown>>) => PackData.parse({ ...base, ...change });

describe("checkReferences", () => {
  it("finds nothing wrong with a consistent pack", () => {
    expect(checkReferences(base)).toEqual([]);
  });

  it("reports items a recipe uses but nobody defines", () => {
    const data = withChange({ recipes: [{ ...base.recipes[0], in: { ore: 1, coal: 2 } }] });
    expect(checkReferences(data)).toEqual([{ path: ["recipes", 0, "in", "coal"], message: "Unknown item 'coal'" }]);
  });

  it("reports unknown buildings of recipes and extractors", () => {
    const data = withChange({
      recipes: [{ ...base.recipes[0], buildings: ["smelter"] }],
      resources: [{ item: "ore", extractors: ["drill"] }],
    });
    expect(checkReferences(data)).toEqual([
      { path: ["recipes", 0, "buildings", 0], message: "Unknown building 'smelter'" },
      { path: ["resources", 0, "extractors", 0], message: "Unknown building 'drill'" },
    ]);
  });

  it("reports resources of unknown items", () => {
    const data = withChange({ resources: [{ item: "gold" }] });
    expect(checkReferences(data)).toEqual([{ path: ["resources", 0, "item"], message: "Unknown item 'gold'" }]);
  });

  it("reports ids defined twice, at the second definition", () => {
    const data = withChange({ items: [...base.items, { id: "ore", name: "Ore again", form: "solid" }] });
    expect(checkReferences(data)).toEqual([{ path: ["items", 2, "id"], message: "Item 'ore' is defined twice" }]);
  });
});

describe("checkReferences on starter factories", () => {
  const starter = {
    id: "plates",
    name: "Plates",
    graph: {
      nodes: {
        ore: { kind: "source", item: "ore" },
        smelt: { kind: "recipe", recipe: "plate", building: "furnace" },
        out: { kind: "sink", item: "plate" },
        hint: { kind: "note", text: "Add more furnaces" },
      },
      edges: { a: { from: "ore", to: "smelt", item: "ore" }, b: { from: "smelt", to: "out", item: "plate" } },
    },
  };
  const withStarter = (graph: unknown) => withChange({ starters: [{ ...starter, graph }] });

  it("finds nothing wrong with a starter that uses the pack's data", () => {
    expect(checkReferences(withChange({ starters: [starter] }))).toEqual([]);
  });

  it("reports recipes, buildings and items the pack doesn't define", () => {
    const nodes = {
      smelt: { kind: "recipe", recipe: "gear", building: "press" },
      out: { kind: "sink", item: "gear" },
    };
    expect(checkReferences(withStarter({ nodes, edges: {} }))).toEqual([
      { path: ["starters", 0, "graph", "nodes", "smelt", "recipe"], message: "Unknown recipe 'gear'" },
      { path: ["starters", 0, "graph", "nodes", "smelt", "building"], message: "Unknown building 'press'" },
      { path: ["starters", 0, "graph", "nodes", "out", "item"], message: "Unknown item 'gear'" },
    ]);
  });

  it("reports flows between nodes that aren't there, and of unknown items or belts", () => {
    const edges = { a: { from: "ghost", to: "smelt", item: "coal", logistics: "belt" } };
    expect(checkReferences(withStarter({ nodes: starter.graph.nodes, edges }))).toEqual([
      { path: ["starters", 0, "graph", "edges", "a", "from"], message: "Unknown node 'ghost'" },
      { path: ["starters", 0, "graph", "edges", "a", "item"], message: "Unknown item 'coal'" },
      { path: ["starters", 0, "graph", "edges", "a", "logistics"], message: "Unknown logistics 'belt'" },
    ]);
  });
});
