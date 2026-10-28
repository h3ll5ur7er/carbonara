// The Satisfactory pack: its importer (packs/satisfactory/plugin) against an excerpt of the game's en-US.json,
// and the committed data against numbers from the game.
// The tests live here because Vitest runs tests below tools/; the importer itself ships with the pack.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PackData, type Recipe } from "../../src/contracts/pack";
import { readPackFiles } from "../../src/engines/packs/files";
import { checkReferences } from "../../src/engines/packs/references";
import { docsExcerpt } from "../../packs/satisfactory/plugin/importer.fixture";
import plugin from "../../packs/satisfactory/plugin/index";

/** The game ships its docs as UTF-16 little endian with a byte order mark. */
function utf16(text: string): Uint8Array {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    bytes[2 + index * 2] = code & 0xff;
    bytes[3 + index * 2] = code >> 8;
  }
  return bytes;
}

const docsFile = (docs: unknown = docsExcerpt) => ({ "en-US.json": utf16(JSON.stringify(docs)) });

function run(files: Record<string, Uint8Array> = docsFile()) {
  if (!plugin.importer) throw new Error("The Satisfactory plugin has no importer");
  return plugin.importer.run(files);
}

function recipe(recipes: Recipe[] | undefined, id: string): Recipe {
  const found = recipes?.find((entry) => entry.id === id);
  if (!found) throw new Error(`No recipe ${id}`);
  return found;
}

/** Items per minute that one machine moves at speed 1. */
const perMinute = (amount: number | undefined, time: number) => ((amount ?? 0) * 60) / time;

describe("the Satisfactory importer", () => {
  it("accepts the game's docs file under its 1.1 and its older name", () => {
    expect(plugin.importer?.accepts).toEqual(["en-US.json", "Docs.json"]);
  });

  it("reads the UTF-16 file the game ships as well as a UTF-8 copy", () => {
    const fromUtf8 = run({ "Docs.json": new TextEncoder().encode(JSON.stringify(docsExcerpt)) });
    expect(run().data).toEqual(fromUtf8.data);
  });

  it("produces data that is a valid pack in items per minute", () => {
    const { data } = run();
    expect(data.units).toEqual({ rate: "per_minute" });
    expect(checkReferences(PackData.parse(data))).toEqual([]);
  });

  it("names items after the game and treats liquids and gases as fluids", () => {
    const { data } = run();
    expect(data.items).toContainEqual({ id: "iron-ingot", name: "Iron Ingot", form: "solid" });
    expect(data.items).toContainEqual({ id: "water", name: "Water", form: "fluid" });
    expect(data.items).toContainEqual({ id: "nitrogen-gas", name: "Nitrogen Gas", form: "fluid" });
  });

  it("keeps only items that a machine, a generator or a resource node deals with", () => {
    const ids = run().data.items?.map((item) => item.id);
    expect(ids).not.toContain("paleberry");
    expect(ids).toEqual(
      expect.arrayContaining(["iron-ore", "coal", "uranium-fuel-rod", "uranium-waste", "nitrogen-gas"]),
    );
  });

  it("takes machine recipes with seconds per craft, and leaves out what the build gun makes", () => {
    const { data } = run();
    expect(recipe(data.recipes, "iron-ingot")).toEqual({
      id: "iron-ingot",
      name: "Iron Ingot",
      buildings: ["smelter"],
      time: 2,
      in: { "iron-ore": 1 },
      out: { "iron-ingot": 1 },
    });
    expect(data.recipes?.map((entry) => entry.name)).not.toContain("Smelter");
  });

  it("tags alternates and counts fluids in cubic metres", () => {
    expect(recipe(run().data.recipes, "alt-pure-iron-ingot")).toEqual({
      id: "alt-pure-iron-ingot",
      name: "Alternate: Pure Iron Ingot",
      buildings: ["refinery"],
      time: 12,
      in: { "iron-ore": 7, water: 4 },
      out: { "iron-ingot": 13 },
      tags: ["alternate"],
      unlock: "hard-drives",
    });
  });

  it("gives recipes that share a name an id per building", () => {
    const docs = structuredClone(docsExcerpt);
    const recipes = docs.find((group) => group.NativeClass.endsWith("FGRecipe'"))?.Classes ?? [];
    const original = recipes.find((entry) => entry.ClassName === "Recipe_IngotIron_C");
    if (!original) throw new Error("The fixture lost its Iron Ingot recipe");
    recipes.push({
      ...original,
      ClassName: "Recipe_IngotIron_Refined_C",
      mProducedIn: String(original.mProducedIn).replace(
        /SmelterMk1\/Build_SmelterMk1\.Build_SmelterMk1_C/,
        "OilRefinery/Build_OilRefinery.Build_OilRefinery_C",
      ),
    });
    const ids = run(docsFile(docs)).data.recipes?.map((entry) => entry.id);
    expect(ids).toEqual(expect.arrayContaining(["iron-ingot-smelter", "iron-ingot-refinery"]));
    expect(ids).not.toContain("iron-ingot");
  });

  it("gives buildings their power, speed and the clock the plugin interprets", () => {
    const buildings = run().data.buildings;
    const clock = { min: 1, max: 250, default: 100 };
    expect(buildings).toContainEqual({
      id: "smelter",
      name: "Smelter",
      speed: 1,
      power: { consume: 4 },
      fields: { clock },
    });
    expect(buildings).toContainEqual({
      id: "miner-mk1",
      name: "Miner Mk.1",
      speed: 1,
      power: { consume: 5 },
      fields: { clock },
    });
    expect(buildings).toContainEqual({
      id: "coal-powered-generator",
      name: "Coal-Powered Generator",
      speed: 1,
      power: { produce: 75 },
      fields: { clock },
    });
  });

  it("gives buildings with recipe-dependent power the middle of their range", () => {
    const accelerator = run().data.buildings?.find((building) => building.id === "particle-accelerator");
    expect(accelerator?.power).toEqual({ consume: 875 });
  });

  it("turns each generator fuel into a recipe that burns it at full power", () => {
    const recipes = run().data.recipes;
    const coal = recipe(recipes, "coal-powered-generator-coal");
    expect(coal).toMatchObject({
      name: "Coal-Powered Generator (Coal)",
      buildings: ["coal-powered-generator"],
      out: {},
    });
    expect(coal.tags).toEqual(["power"]);
    expect(perMinute(coal.in.coal, coal.time)).toBe(15);
    expect(perMinute(coal.in.water, coal.time)).toBe(45);

    const nuclear = recipe(recipes, "nuclear-power-plant-uranium-fuel-rod");
    expect(perMinute(nuclear.in["uranium-fuel-rod"], nuclear.time)).toBeCloseTo(0.2);
    expect(perMinute(nuclear.in.water, nuclear.time)).toBeCloseTo(240);
    expect(perMinute(nuclear.out["uranium-waste"], nuclear.time)).toBeCloseTo(10);
  });

  it("lists belts and pipelines with their throughput per minute and plain-language aliases", () => {
    expect(run().data.logistics).toEqual([
      {
        id: "conveyor-belt-mk1",
        name: "Conveyor Belt Mk.1",
        aliases: ["mk1 belt", "belt mk1"],
        carries: "solid",
        capacity: 60,
      },
      {
        id: "conveyor-belt-mk6",
        name: "Conveyor Belt Mk.6",
        aliases: ["mk6 belt", "belt mk6"],
        carries: "solid",
        capacity: 1200,
      },
      { id: "pipeline-mk1", name: "Pipeline Mk.1", aliases: ["mk1 pipe", "pipe mk1"], carries: "fluid", capacity: 300 },
      { id: "pipeline-mk2", name: "Pipeline Mk.2", aliases: ["mk2 pipe", "pipe mk2"], carries: "fluid", capacity: 600 },
    ]);
  });

  it("lists resources with the map's limits and the extractors that can mine them", () => {
    const resources = run().data.resources;
    expect(resources).toContainEqual({ item: "iron-ore", limit: 92100, extractors: ["miner-mk1"] });
    expect(resources).toContainEqual({ item: "nitrogen-gas", limit: 12000, extractors: ["resource-well-extractor"] });
    expect(resources).toContainEqual({ item: "water", extractors: ["water-extractor", "resource-well-extractor"] });
  });

  it("names icons after the item ids, matching items by texture and buildings by name", () => {
    const ingot = new Uint8Array([1]);
    const smelter = new Uint8Array([2]);
    const { data, icons } = run({
      ...docsFile(),
      "icons/IconDesc_IronIngot.webp": ingot,
      "icons/Smelter.webp": smelter,
      "icons/IconDesc_Berry.webp": new Uint8Array([3]), // Paleberry isn't in the pack, so neither is its icon
    });
    expect(icons).toEqual({ "icons/iron-ingot.webp": ingot, "icons/smelter.webp": smelter });
    expect(data.items).toContainEqual({
      id: "iron-ingot",
      name: "Iron Ingot",
      form: "solid",
      icon: "icons/iron-ingot.webp",
    });
    expect(data.buildings?.find((building) => building.id === "smelter")?.icon).toBe("icons/smelter.webp");
    expect(data.items?.find((item) => item.id === "iron-ore")).not.toHaveProperty("icon");
  });
});

describe("the Satisfactory importer's unlocks", () => {
  /** The fixture with another schematic that unlocks `recipe`. */
  function withSchematic(schematic: Record<string, unknown>, recipe: string) {
    const docs = structuredClone(docsExcerpt);
    const schematics = docs.find((group) => group.NativeClass.endsWith("FGSchematic'"))?.Classes ?? [];
    schematics.push({
      ClassName: "Schematic_Extra_C",
      mMenuPriority: "0.000000",
      mTechTier: "0",
      mUnlocks: [
        {
          Class: "BP_UnlockRecipe_C",
          mRecipes: `("/Script/Engine.BlueprintGeneratedClass'/Game/${recipe}.${recipe}_C'")`,
        },
      ],
      ...schematic,
    });
    return run(docsFile(docs)).data;
  }

  it("lists the milestones that unlock recipes by tier, then hard drive research", () => {
    expect(run().data.unlocks).toEqual([
      { id: "coal-power", name: "Coal Power", section: "Tier 3" },
      { id: "nuclear-power", name: "Nuclear Power", section: "Tier 8" },
      { id: "hard-drives", name: "Hard drives", section: "MAM research" },
    ]);
  });

  it("unlocks a generator's fuels with the milestone that unlocks the generator, alternates with hard drives", () => {
    const { recipes } = run().data;
    expect(recipe(recipes, "coal-powered-generator-coal").unlock).toBe("coal-power");
    expect(recipe(recipes, "nuclear-power-plant-uranium-fuel-rod").unlock).toBe("nuclear-power");
    expect(recipe(recipes, "alt-pure-iron-ingot").unlock).toBe("hard-drives");
    // The starting recipes need nothing.
    expect(recipe(recipes, "iron-ingot").unlock).toBeUndefined();
  });

  it("files MAM research under its research tree, which comes before hard drives and opens with tier 1", () => {
    const data = withSchematic(
      {
        FullName:
          "BlueprintGeneratedClass /Game/FactoryGame/Schematics/Research/Caterium_RS/Research_Caterium_1.Research_Caterium_1_C",
        mType: "EST_MAM",
        mDisplayName: "Caterium Ingots",
      },
      "Recipe_Alternate_PureIronIngot",
    );
    expect(recipe(data.recipes, "alt-pure-iron-ingot").unlock).toBe("mam-caterium");
    expect(data.unlocks).toContainEqual({ id: "mam-caterium", name: "Caterium", section: "MAM research" });
  });

  it("counts a milestone's background unlocks as the milestone's", () => {
    const data = withSchematic(
      {
        ClassName: "Schematic_3-1-1_C",
        FullName: "BlueprintGeneratedClass /Game/FactoryGame/Schematics/Progression/Schematic_3-1-1.Schematic_3-1-1_C",
        mType: "EST_Custom",
        mDisplayName: "Coal Power - Background Unlocks",
        mTechTier: "3",
      },
      "Recipe_GeneratorNuclear",
    );
    // Coal Power (tier 3) now comes with the nuclear plant, before Nuclear Power (tier 8).
    expect(recipe(data.recipes, "nuclear-power-plant-uranium-fuel-rod").unlock).toBe("coal-power");
  });

  it("names a pack without schematics' unlocks none", () => {
    const docs = docsExcerpt.filter((group) => !group.NativeClass.endsWith("FGSchematic'"));
    const data = run(docsFile(docs)).data;
    expect(data.unlocks ?? []).toEqual([]);
    expect(data.recipes?.every((entry) => entry.unlock === undefined)).toBe(true);
  });
});

describe("the committed Satisfactory pack", () => {
  const folder = "packs/satisfactory";
  const files: Record<string, Uint8Array> = {
    "manifest.yaml": readFileSync(join(folder, "manifest.yaml")),
    "plugin/index.js": new Uint8Array(), // bundled at build time; only the data matters here
  };
  for (const name of readdirSync(join(folder, "data")))
    files[`data/${name}`] = readFileSync(join(folder, "data", name));
  const pack = readPackFiles(files);
  if (!pack.ok) throw new Error(pack.error.map((issue) => `${issue.path.join(" › ")}: ${issue.message}`).join("\n"));
  const { data } = pack.value;
  const find = <T extends { id: string }>(entries: T[], id: string): T => {
    const found = entries.find((entry) => entry.id === id);
    if (!found) throw new Error(`No ${id}`);
    return found;
  };

  it("holds all of Satisfactory 1.1 that factories are built from", () => {
    expect(data.items).toHaveLength(168);
    expect(data.buildings).toHaveLength(21);
    expect(data.recipes).toHaveLength(308);
    expect(data.recipes.filter((entry) => entry.tags?.includes("alternate"))).toHaveLength(110);
    expect(data.recipes.filter((entry) => entry.tags?.includes("power"))).toHaveLength(17);
  });

  it("says what unlocks each recipe: milestones by tier, MAM research trees, hard drives", () => {
    expect(find(data.unlocks, "part-assembly")).toEqual({
      id: "part-assembly",
      name: "Part Assembly",
      section: "Tier 2",
    });
    expect(find(data.recipes, "reinforced-iron-plate").unlock).toBe("hub-upgrade-3");
    expect(find(data.recipes, "rotor").unlock).toBe("part-assembly");
    expect(find(data.recipes, "quickwire").unlock).toBe("mam-caterium");
    expect(find(data.recipes, "coal-powered-generator-coal").unlock).toBe("coal-power");
    expect(data.recipes.filter((entry) => entry.unlock === "hard-drives")).toHaveLength(109);
    expect(data.recipes.filter((entry) => entry.unlock === undefined).map((entry) => entry.id)).toEqual([
      "iron-ingot",
      "iron-plate",
      "iron-rod",
    ]);
  });

  it("matches recipe rates from the game", () => {
    const ingot = find(data.recipes, "iron-ingot");
    expect(ingot.buildings).toEqual(["smelter"]);
    expect(perMinute(ingot.in["iron-ore"], ingot.time)).toBe(30);
    expect(perMinute(ingot.out["iron-ingot"], ingot.time)).toBe(30);

    const plate = find(data.recipes, "reinforced-iron-plate");
    expect(plate.buildings).toEqual(["assembler"]);
    expect(perMinute(plate.in["iron-plate"], plate.time)).toBe(30);
    expect(perMinute(plate.in.screws, plate.time)).toBe(60);
    expect(perMinute(plate.out["reinforced-iron-plate"], plate.time)).toBe(5);

    const pure = find(data.recipes, "alt-pure-iron-ingot");
    expect(perMinute(pure.in.water, pure.time)).toBe(20);
    expect(perMinute(pure.out["iron-ingot"], pure.time)).toBe(65);

    const plastic = find(data.recipes, "plastic");
    expect(plastic.buildings).toEqual(["refinery"]);
    expect(perMinute(plastic.in["crude-oil"], plastic.time)).toBe(30);
    expect(perMinute(plastic.out["heavy-oil-residue"], plastic.time)).toBe(10);
  });

  it("matches building power and generator fuel use from the game", () => {
    const power = (id: string) => find(data.buildings, id).power;
    expect(power("smelter")).toEqual({ consume: 4 });
    expect(power("constructor")).toEqual({ consume: 4 });
    expect(power("assembler")).toEqual({ consume: 15 });
    expect(power("manufacturer")).toEqual({ consume: 55 });
    expect(power("refinery")).toEqual({ consume: 30 });
    expect(power("miner-mk1")).toEqual({ consume: 5 });
    expect(power("coal-powered-generator")).toEqual({ produce: 75 });
    expect(power("nuclear-power-plant")).toEqual({ produce: 2500 });

    const fuel = find(data.recipes, "fuel-powered-generator-fuel");
    expect(perMinute(fuel.in.fuel, fuel.time)).toBe(20);
    const rods = find(data.recipes, "nuclear-power-plant-uranium-fuel-rod");
    expect(perMinute(rods.in["uranium-fuel-rod"], rods.time)).toBeCloseTo(0.2);
    expect(perMinute(rods.out["uranium-waste"], rods.time)).toBeCloseTo(10);
  });

  it("matches belt and pipeline throughput from the game", () => {
    const capacity = (id: string) => find(data.logistics, id).capacity;
    expect(capacity("conveyor-belt-mk1")).toBe(60);
    expect(capacity("conveyor-belt-mk2")).toBe(120);
    expect(capacity("conveyor-belt-mk3")).toBe(270);
    expect(capacity("conveyor-belt-mk4")).toBe(480);
    expect(capacity("conveyor-belt-mk5")).toBe(780);
    expect(capacity("conveyor-belt-mk6")).toBe(1200);
    expect(capacity("pipeline-mk1")).toBe(300);
    expect(capacity("pipeline-mk2")).toBe(600);
    expect(find(data.logistics, "conveyor-belt-mk5").aliases).toContain("mk5 belt");
  });

  it("has an icon file for every icon it names", () => {
    const icons = [...data.items, ...data.buildings].flatMap((entry) => (entry.icon ? [entry.icon] : []));
    expect(icons.length).toBeGreaterThan(data.items.length);
    for (const icon of icons) expect(existsSync(join(folder, icon)), icon).toBe(true);
    expect(readdirSync(join(folder, "icons"))).toHaveLength(icons.length); // and no icon nobody uses
  });
});
