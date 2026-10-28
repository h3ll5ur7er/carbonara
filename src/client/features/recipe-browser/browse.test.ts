import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PackData } from "../../../contracts/pack";
import { templatePack } from "../../scenes/template-pack";
import { browsable, browserRows, groupOptions, matching, searchRecipes, shelves, type BrowsedRecipe } from "./browse";

const pack = PackData.parse({
  items: [
    { id: "ore", name: "Ore", form: "solid" },
    { id: "coal", name: "Coal", form: "solid" },
    { id: "plate", name: "Plate", form: "solid", aliases: ["sheet"] },
    { id: "gear", name: "Gear", form: "solid" },
    { id: "water", name: "Water", form: "fluid" },
  ],
  buildings: [
    { id: "assembler", name: "Assembler" },
    { id: "furnace", name: "Furnace" },
    { id: "pump", name: "Pump" },
  ],
  categories: [
    { id: "parts", name: "Parts", section: "Components" },
    { id: "metal", name: "Metal", section: "Materials" },
  ],
  unlocks: [
    { id: "smelting", name: "Smelting", section: "Tier 1" },
    { id: "gears", name: "Gears", section: "Tier 2" },
  ],
  recipes: [
    {
      id: "gear",
      buildings: ["assembler"],
      time: 1,
      in: { plate: 2 },
      out: { gear: 1 },
      category: "parts",
      unlock: "gears",
    },
    { id: "plate", buildings: ["furnace"], time: 2, in: { ore: 1 }, out: { plate: 1 }, category: "metal" },
    {
      id: "coal-plate",
      name: "Coal Plate",
      buildings: ["furnace", "assembler"],
      time: 3,
      in: { ore: 2, coal: 1 },
      out: { plate: 2 },
      tags: ["alternate"],
      category: "metal",
      unlock: "smelting",
    },
    {
      id: "gear-recycling",
      name: "Gear Recycling",
      buildings: ["assembler"],
      time: 1,
      in: { gear: 1 },
      out: { plate: 0.5 },
      tags: ["recycling"],
      category: "parts",
      unlock: "gears",
    },
    { id: "water", buildings: ["pump"], time: 1, out: { water: 10 } },
  ],
});

const ids = (recipes: BrowsedRecipe[]) => recipes.map((recipe) => recipe.id);

describe("browsable", () => {
  it("describes each recipe by its main product, its default building and what it takes", () => {
    const [gear] = browsable(pack);
    expect(gear).toMatchObject({
      id: "gear",
      title: "Gear",
      product: { id: "gear", name: "Gear", form: "solid" },
      building: { id: "assembler", name: "Assembler" },
      inputs: ["Plate"],
      alternate: false,
      recycling: false,
    });
    expect(browsable(pack).find((recipe) => recipe.id === "coal-plate")).toMatchObject({
      title: "Coal Plate",
      building: { id: "furnace", name: "Furnace" },
      inputs: ["Ore", "Coal"],
      alternate: true,
    });
  });
});

describe("groupOptions", () => {
  it("offers categories and unlocks only when the pack has them", () => {
    expect(groupOptions(pack)).toEqual(["building", "category", "unlock"]);
    expect(
      groupOptions(PackData.parse({ recipes: pack.recipes.map(({ category: _c, unlock: _u, ...r }) => r) })),
    ).toEqual(["building"]);
  });
});

describe("shelves", () => {
  const recipes = browsable(pack);

  it("groups by default building in the pack's order of buildings, a recipe's main product then standard first", () => {
    expect(shelves(recipes, pack, "building").map((shelf) => [shelf.id, shelf.name, ids(shelf.recipes)])).toEqual([
      ["building:assembler", "Assembler", ["gear", "gear-recycling"]],
      ["building:furnace", "Furnace", ["plate", "coal-plate"]],
      ["building:pump", "Pump", ["water"]],
    ]);
  });

  it("groups by category in the pack's order, under their sections, with the rest last", () => {
    expect(
      shelves(recipes, pack, "category").map((shelf) => [shelf.id, shelf.name, shelf.section, ids(shelf.recipes)]),
    ).toEqual([
      ["category:parts", "Parts", "Components", ["gear", "gear-recycling"]],
      ["category:metal", "Metal", "Materials", ["plate", "coal-plate"]],
      ["category:", "Other", undefined, ["water"]],
    ]);
  });

  it("groups by unlock, with what the game starts with first", () => {
    expect(
      shelves(recipes, pack, "unlock").map((shelf) => [shelf.id, shelf.name, shelf.section, ids(shelf.recipes)]),
    ).toEqual([
      ["unlock:", "From the start", undefined, ["plate", "water"]],
      ["unlock:smelting", "Smelting", "Tier 1", ["coal-plate"]],
      ["unlock:gears", "Gears", "Tier 2", ["gear", "gear-recycling"]],
    ]);
  });

  it("leaves out groups with nothing in them", () => {
    const furnaceOnly = recipes.filter((recipe) => recipe.building.id === "furnace");
    expect(shelves(furnaceOnly, pack, "unlock").map((shelf) => shelf.id)).toEqual(["unlock:", "unlock:smelting"]);
  });

  it("puts every recipe in exactly one group, whatever the grouping", () => {
    for (const by of groupOptions(templatePack)) {
      const all = browsable(templatePack);
      const grouped = shelves(all, templatePack, by).flatMap((shelf) => ids(shelf.recipes));
      expect(grouped.sort()).toEqual(ids(all).sort());
    }
  });
});

describe("matching", () => {
  const recipes = browsable(pack);

  it("leaves out recycling unless asked, and keeps everything else for an empty query", () => {
    expect(ids(matching(recipes, "", { recycling: false }))).toEqual(["gear", "plate", "coal-plate", "water"]);
    expect(ids(matching(recipes, "", { recycling: true }))).toContain("gear-recycling");
  });

  it("finds recipes by every word typed: names, items and their aliases, buildings, groups, 'alternate'", () => {
    const find = (query: string) => ids(matching(recipes, query, { recycling: false }));
    expect(find("plate")).toEqual(["gear", "plate", "coal-plate"]);
    expect(find("sheet coal")).toEqual(["coal-plate"]);
    expect(find("FURNACE")).toEqual(["plate", "coal-plate"]);
    expect(find("alternate")).toEqual(["coal-plate"]);
    expect(find("tier 2")).toEqual(["gear"]);
    expect(find("components")).toEqual(["gear"]);
    expect(find("nothing like it")).toEqual([]);
  });
});

describe("searchRecipes", () => {
  const recipes = browsable(pack);
  const search = (query: string) => ids(searchRecipes(recipes, query, { recycling: false }));

  it("puts recipes named for every word first, then those making a match, then those using one", () => {
    // "Coal Plate" is named for it; "Plate" makes a plate; "Gear" only takes one.
    expect(search("plate")).toEqual(["plate", "coal-plate", "gear"]);
    expect(search("coal plate")).toEqual(["coal-plate"]);
  });

  it("puts names starting with the first word before others, and standard recipes before alternates", () => {
    const named = browsable(
      PackData.parse({
        ...pack,
        recipes: [
          { id: "b", name: "Sheet Plate", buildings: ["furnace"], time: 1, out: { plate: 1 } },
          { id: "a", name: "Plate Alt", buildings: ["furnace"], time: 1, out: { plate: 1 }, tags: ["alternate"] },
          { id: "c", name: "Plate", buildings: ["furnace"], time: 1, out: { plate: 1 } },
        ],
      }),
    );
    expect(ids(searchRecipes(named, "plate", { recycling: false }))).toEqual(["c", "a", "b"]);
  });

  it("finds nothing for nothing typed", () => {
    expect(search("  ")).toEqual([]);
  });
});

describe("browserRows", () => {
  const groups = shelves(browsable(pack), pack, "category");

  it("lists each section's heading once, then its groups, and the recipes of the open ones", () => {
    const rows = browserRows(groups, (id) => id === "category:metal");
    expect(rows.map((row) => (row.kind === "recipe" ? `  ${row.recipe.id}` : `${row.kind} ${row.key}`))).toEqual([
      "section section:Components",
      "group category:parts",
      "section section:Materials",
      "group category:metal",
      "  plate",
      "  coal-plate",
      "section section:",
      "group category:",
    ]);
  });

  it("gives every row a key of its own", () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }), (open) => {
        const rows = browserRows(groups, (id) => open[groups.findIndex((group) => group.id === id)] ?? false);
        expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
      }),
    );
  });
});
