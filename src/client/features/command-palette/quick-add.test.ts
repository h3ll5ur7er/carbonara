import { describe, expect, it, vi } from "vitest";
import { PackData } from "../../../contracts/pack";
import type { Connector } from "../../core/connector";
import { addRecipeNode, quickAddEntries } from "./quick-add";

const pack = PackData.parse({
  items: [
    { id: "ferrite-ore", name: "Ferrite Ore", form: "solid" },
    { id: "coal", name: "Coal", form: "solid" },
    { id: "clean-ferrite", name: "Clean Ferrite", form: "solid" },
    { id: "iron-plate", name: "Iron Plate", form: "solid" },
    { id: "iron-gear", name: "Iron Gear", form: "solid", aliases: ["gear"] },
  ],
  buildings: [
    { id: "furnace", name: "Furnace" },
    { id: "assembler", name: "Assembler" },
    { id: "fast-assembler", name: "Fast Assembler" },
  ],
  recipes: [
    { id: "iron-plate", buildings: ["furnace"], time: 3, in: { "clean-ferrite": 1 }, out: { "iron-plate": 1 } },
    {
      id: "iron-plate-from-ore",
      name: "Iron Plate (Coal Smelting)",
      buildings: ["furnace"],
      time: 4,
      in: { "ferrite-ore": 2, coal: 1 },
      out: { "iron-plate": 1 },
    },
    {
      id: "iron-gear",
      buildings: ["assembler", "fast-assembler"],
      time: 1,
      in: { "iron-plate": 2 },
      out: { "iron-gear": 1 },
    },
  ],
});

describe("quickAddEntries", () => {
  it("offers every recipe, named after the recipe or else its first output", () => {
    expect(quickAddEntries(pack).map((entry) => [entry.recipeId, entry.title])).toEqual([
      ["iron-plate", "Iron Plate"],
      ["iron-plate-from-ore", "Iron Plate (Coal Smelting)"],
      ["iron-gear", "Iron Gear"],
    ]);
  });

  it("describes where the recipe runs and what it turns into what", () => {
    const [plate, alternate] = quickAddEntries(pack);
    expect(plate?.detail).toBe("Furnace · Clean Ferrite → Iron Plate");
    expect(alternate?.detail).toBe("Furnace · Ferrite Ore, Coal → Iron Plate");
  });

  it("finds a recipe by its outputs, their aliases and its buildings", () => {
    const gear = quickAddEntries(pack).find((entry) => entry.recipeId === "iron-gear");
    expect(gear?.keywords).toEqual(expect.arrayContaining(["Iron Gear", "gear", "Assembler", "Fast Assembler"]));
  });

  it("falls back to ids for things the pack doesn't name", () => {
    const bare = PackData.parse({ recipes: [{ id: "mystery", buildings: ["box"], time: 1, out: { goo: 1 } }] });
    expect(quickAddEntries(bare)).toEqual([
      { recipeId: "mystery", title: "goo", detail: "box · → goo", keywords: ["goo", "box", "mystery"] },
    ]);
  });
});

describe("addRecipeNode", () => {
  it("adds a recipe node through the editing manager as one undo step", async () => {
    const apply = vi.fn<Connector["editing"]["apply"]>().mockResolvedValue({
      ok: true,
      value: { id: "doc-1", name: "Factory", packId: "template", version: 3 },
    });
    const [plate] = quickAddEntries(pack);
    if (!plate) throw new Error("no entry");
    await addRecipeNode({ apply }, "doc-1", plate, { x: 120, y: 48 });
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      documentId: "doc-1",
      commands: [
        { type: "addNode", graph: "root", node: { kind: "recipe", recipe: "iron-plate" }, position: { x: 120, y: 48 } },
      ],
      label: "Add Iron Plate",
    });
  });
});
