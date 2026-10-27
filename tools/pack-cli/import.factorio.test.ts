// The Factorio pack: its importer (packs/factorio/plugin) against an excerpt of the game's `--dump-data` output and
// English locale, and the committed data against numbers from the game.
// The tests live here because Vitest runs tests below tools/; the importer itself ships with the pack.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PackData } from "../../src/contracts/pack";
import { readPackFiles } from "../../src/engines/packs/files";
import { checkReferences } from "../../src/engines/packs/references";
import { dumpExcerpt, localeExcerpt } from "../../packs/factorio/plugin/importer.fixture";
import plugin from "../../packs/factorio/plugin/index";

const encode = (text: string) => new TextEncoder().encode(text);

function gameFiles(dump: unknown = dumpExcerpt, locale: Record<string, string> = localeExcerpt) {
  return {
    "data-raw-dump.json": encode(JSON.stringify(dump)),
    ...Object.fromEntries(Object.entries(locale).map(([name, text]) => [name, encode(text)])),
  };
}

function run(files: Record<string, Uint8Array> = gameFiles()) {
  if (!plugin.importer) throw new Error("The Factorio plugin has no importer");
  return plugin.importer.run(files);
}

function find<T extends { id: string }>(entries: T[] | undefined, id: string): T {
  const found = entries?.find((entry) => entry.id === id);
  if (!found) throw new Error(`No ${id}`);
  return found;
}

/** Items per second that one machine moves at speed 1. */
const perSecond = (amount: number | undefined, time: number) => (amount ?? 0) / time;

describe("the Factorio importer", () => {
  it("accepts the game's data dump and its English locale files", () => {
    expect(plugin.importer?.accepts).toEqual([
      "data-raw-dump.json",
      "core.cfg",
      "base.cfg",
      "elevated-rails.cfg",
      "quality.cfg",
      "recycler.cfg",
      "space-age.cfg",
    ]);
  });

  it("produces data that is a valid pack in items per second", () => {
    const { data } = run();
    expect(data.units).toEqual({ rate: "per_second" });
    expect(checkReferences(PackData.parse(data))).toEqual([]);
  });

  it("names items and fluids as the English locale does", () => {
    const { items } = run().data;
    expect(items).toContainEqual({ id: "iron-plate", name: "Iron plate", form: "solid" });
    expect(items).toContainEqual({ id: "uranium-235", name: "Uranium-235", form: "solid" });
    expect(items).toContainEqual({ id: "crude-oil", name: "Crude oil", form: "fluid" });
    expect(items).toContainEqual({ id: "molten-iron", name: "Molten iron", form: "fluid" });
  });

  it("adds a variant of every solid item for each quality above normal, named with the quality", () => {
    const { items } = run().data;
    expect(items).toContainEqual({ id: "iron-plate@uncommon", name: "Iron plate (Uncommon)", form: "solid" });
    expect(items?.filter((item) => item.id.startsWith("iron-plate@")).map((item) => item.id)).toEqual([
      "iron-plate@uncommon",
      "iron-plate@rare",
      "iron-plate@epic",
      "iron-plate@legendary",
    ]);
    // Fluids have no quality, and the variants follow their item.
    const ids = items?.map((item) => item.id) ?? [];
    expect(ids).not.toContain("crude-oil@rare");
    expect(ids.indexOf("iron-plate@uncommon")).toBe(ids.indexOf("iron-plate") + 1);
  });

  it("names quality variants from the ids without a locale, and makes none without the quality mod", () => {
    expect(find(run(gameFiles(dumpExcerpt, {})).data.items, "iron-plate@rare").name).toBe("Iron plate (Rare)");
    const dump = structuredClone(dumpExcerpt);
    delete dump.quality;
    expect(run(gameFiles(dump)).data.items?.some((item) => item.id.includes("@"))).toBe(false);
  });

  it("fills in localised names with parameters, and names buildings after their entity", () => {
    const { data } = run();
    expect(find(data.recipes, "crude-oil-barrel").name).toBe("Fill Crude oil barrel");
    expect(find(data.recipes, "iron-gear-wheel-recycling").name).toBe("Iron gear wheel recycling");
    expect(find(data.recipes, "kovarex-enrichment-process").name).toBe("Kovarex enrichment process");
    // Recipes without a name of their own are named after their product.
    expect(find(data.recipes, "iron-plate").name).toBe("Iron plate");
    expect(find(data.buildings, "electromagnetic-plant").name).toBe("Electromagnetic plant");
  });

  it("makes names from ids when no locale is given", () => {
    const { data } = run(gameFiles(dumpExcerpt, {}));
    expect(find(data.items, "iron-gear-wheel").name).toBe("Iron gear wheel");
    expect(find(data.recipes, "crude-oil-barrel").name).toBe("Crude oil barrel");
    expect(find(data.buildings, "assembling-machine-1").name).toBe("Assembling machine 1");
  });

  it("takes recipes with seconds per craft and every machine whose crafting categories include the recipe's", () => {
    const { recipes } = run().data;
    expect(find(recipes, "iron-plate")).toEqual({
      id: "iron-plate",
      name: "Iron plate",
      buildings: ["stone-furnace", "steel-furnace", "electric-furnace"],
      time: 3.2,
      in: { "iron-ore": 1 },
      out: { "iron-plate": 1 },
      tags: ["productivity"],
    });
    expect(find(recipes, "steel-plate")).toMatchObject({
      time: 16,
      in: { "iron-plate": 5 },
      out: { "steel-plate": 1 },
    });
    // No category means "crafting"; no time means half a second.
    expect(find(recipes, "iron-gear-wheel")).toMatchObject({
      buildings: ["assembling-machine-1", "assembling-machine-2", "assembling-machine-3"],
      time: 0.5,
    });
    // Base game machines come first; the first is the default.
    expect(find(recipes, "electronic-circuit").buildings).toEqual([
      "assembling-machine-1",
      "assembling-machine-2",
      "assembling-machine-3",
      "electromagnetic-plant",
    ]);
    expect(find(recipes, "rocket-part").buildings).toEqual(["rocket-silo"]);
  });

  it("reads Factorio 2.0 dumps, whose recipes have a single category", () => {
    const dump = structuredClone(dumpExcerpt);
    const steel = dump.recipe?.["steel-plate"];
    if (!steel) throw new Error("The fixture lost its steel plate recipe");
    delete steel.categories;
    steel.category = "smelting";
    expect(find(run(gameFiles(dump)).data.recipes, "steel-plate").buildings).toEqual([
      "stone-furnace",
      "steel-furnace",
      "electric-furnace",
    ]);
  });

  it("writes probabilistic and fractional outputs as expected values", () => {
    const { recipes } = run().data;
    expect(find(recipes, "uranium-processing").out).toEqual({ "uranium-235": 0.007, "uranium-238": 0.993 });
    expect(find(recipes, "yumako-processing").out).toEqual({ "yumako-seed": 0.02, "yumako-mash": 2 });
    expect(find(recipes, "iron-gear-wheel-recycling")).toMatchObject({
      buildings: ["recycler"],
      time: 0.03125,
      in: { "iron-gear-wheel": 1 },
      out: { "iron-plate": 0.5 },
    });
  });

  it("keeps catalysts on both sides, and tags the amounts productivity leaves out", () => {
    expect(find(run().data.recipes, "kovarex-enrichment-process")).toMatchObject({
      in: { "uranium-235": 40, "uranium-238": 5 },
      out: { "uranium-235": 41, "uranium-238": 2 },
      tags: [
        "productivity",
        "ignored-by-productivity:uranium-235=40",
        "ignored-by-productivity:uranium-238=2",
        "no-quality",
      ],
    });
  });

  it("leaves out parameters, hidden recipes other than recycling, and what no machine makes", () => {
    const { data } = run();
    const recipeIds = data.recipes?.map((recipe) => recipe.id);
    expect(recipeIds).not.toContain("parameter-0");
    expect(recipeIds).not.toContain("recipe-unknown");
    expect(recipeIds).not.toContain("pistol");
    const itemIds = data.items?.map((item) => item.id);
    expect(itemIds).not.toContain("parameter-0");
    expect(itemIds).not.toContain("pistol");
    expect(itemIds).not.toContain("assembling-machine-1"); // no recipe in the excerpt makes or uses it
  });

  it("leaves out recipes of hidden and spawnable items, such as the editor's infinity chest and blueprints", () => {
    const { data } = run();
    const recipeIds = data.recipes?.map((recipe) => recipe.id);
    expect(recipeIds).toContain("iron-gear-wheel-recycling");
    expect(recipeIds).not.toContain("infinity-chest-recycling");
    expect(recipeIds).not.toContain("blueprint-recycling");
    const itemIds = data.items?.map((item) => item.id);
    expect(itemIds).not.toContain("infinity-chest");
    expect(itemIds).not.toContain("blueprint");
  });

  it("tags recipes with the expansion mods they need, recycling, and whether productivity and quality apply", () => {
    const { recipes } = run().data;
    expect(find(recipes, "casting-iron").tags).toEqual(["space-age", "productivity"]);
    expect(find(recipes, "molten-iron-from-lava").tags).toEqual(["space-age", "productivity"]);
    expect(find(recipes, "iron-gear-wheel-recycling").tags).toEqual(["recycler", "recycling"]);
    // Recipes whose products can't get a better quality.
    expect(find(recipes, "crude-oil-barrel").tags).toEqual(["no-quality"]);
    // A base recipe stays untagged even though a Space Age machine can make it too.
    expect(find(recipes, "electronic-circuit").tags).toEqual(["productivity"]);
  });

  it("gives buildings their crafting speed and power in MW, electric drain included", () => {
    const { buildings } = run().data;
    expect(find(buildings, "assembling-machine-1")).toEqual({
      id: "assembling-machine-1",
      name: "Assembling machine 1",
      speed: 0.5,
      power: { consume: 0.0775 },
      fields: { energy: { drain: 0.0025 } },
    });
    expect(find(buildings, "assembling-machine-2")).toMatchObject({ speed: 0.75, power: { consume: 0.155 } });
    expect(find(buildings, "assembling-machine-3")).toMatchObject({ speed: 1.25, power: { consume: 0.3875 } });
    expect(find(buildings, "electric-furnace")).toMatchObject({ speed: 2, power: { consume: 0.186 } });
    expect(find(buildings, "electric-mining-drill")).toMatchObject({ speed: 0.5, power: { consume: 0.09 } });
  });

  it("keeps what the mechanics plugin needs in fields: module slots, base effects, drain, fuel and the expansion", () => {
    const { buildings } = run().data;
    expect(find(buildings, "assembling-machine-3").fields).toEqual({
      modules: { slots: 4, effects: "consumption,speed,productivity,pollution,quality" },
      energy: { drain: 0.0125 },
    });
    // Without allowed effects, a building takes every module.
    expect(find(buildings, "electric-mining-drill").fields).toEqual({
      modules: { slots: 3, effects: "consumption,speed,productivity,pollution,quality" },
    });
    expect(find(buildings, "stone-furnace")).toEqual({
      id: "stone-furnace",
      name: "Stone furnace",
      speed: 1,
      power: { consume: 0.09 },
      fields: { energy: { source: "burner", fuel: "chemical" } },
    });
    expect(find(buildings, "foundry").fields).toEqual({
      modules: { slots: 4, effects: "consumption,speed,productivity,pollution,quality" },
      "base-effect": { productivity: 0.5 },
      energy: { drain: 0.0833333333333 },
      mod: { name: "space-age" },
    });
    expect(find(buildings, "biochamber").fields).toMatchObject({ energy: { source: "burner", fuel: "nutrients" } });
  });

  it("lists resources with the buildings that extract them: ores, oil, tile fluids, plants and asteroids", () => {
    const { resources } = run().data;
    expect(resources).toContainEqual({
      item: "iron-ore",
      extractors: ["burner-mining-drill", "electric-mining-drill", "big-mining-drill"],
    });
    expect(resources).toContainEqual({ item: "crude-oil", extractors: ["pumpjack"] });
    expect(resources).toContainEqual({ item: "water", extractors: ["offshore-pump"] });
    expect(resources).toContainEqual({ item: "lava", extractors: ["offshore-pump"] });
    expect(resources).toContainEqual({ item: "yumako", extractors: ["agricultural-tower"] });
    expect(resources).toContainEqual({ item: "metallic-asteroid-chunk", extractors: ["asteroid-collector"] });
  });

  it("lists belts with their throughput per second and colour aliases, and pipes", () => {
    expect(run().data.logistics).toEqual([
      {
        id: "transport-belt",
        name: "Transport belt",
        aliases: ["yellow belt", "basic belt"],
        carries: "solid",
        capacity: 15,
      },
      {
        id: "fast-transport-belt",
        name: "Fast transport belt",
        aliases: ["red belt", "fast belt"],
        carries: "solid",
        capacity: 30,
      },
      {
        id: "express-transport-belt",
        name: "Express transport belt",
        aliases: ["blue belt", "express belt"],
        carries: "solid",
        capacity: 45,
      },
      {
        id: "turbo-transport-belt",
        name: "Turbo transport belt",
        aliases: ["green belt", "turbo belt"],
        carries: "solid",
        capacity: 60,
      },
      { id: "pipe", name: "Pipe", aliases: ["fluid pipe"], carries: "fluid", capacity: 6000 },
    ]);
  });

  it("names icons after the ids, matching by prototype name or by the dump's icon file name", () => {
    const plate = new Uint8Array([1]);
    const water = new Uint8Array([2]);
    const furnace = new Uint8Array([3]);
    const { data, icons } = run({
      ...gameFiles(),
      "icons/iron-plate.webp": plate,
      "icons/water.webp": water, // __base__/graphics/icons/fluid/water.png
      "icons/stone-furnace.webp": furnace,
      "icons/pistol.webp": new Uint8Array([4]), // the pistol isn't in the pack, so neither is its icon
    });
    expect(icons).toEqual({
      "icons/iron-plate.webp": plate,
      "icons/water.webp": water,
      "icons/stone-furnace.webp": furnace,
    });
    expect(find(data.items, "iron-plate").icon).toBe("icons/iron-plate.webp");
    expect(find(data.buildings, "stone-furnace").icon).toBe("icons/stone-furnace.webp");
    expect(find(data.items, "iron-ore")).not.toHaveProperty("icon");
  });

  it("matches an icon by the file the dump names when it differs from the prototype name", () => {
    const tree = new Uint8Array([5]);
    const dump = structuredClone(dumpExcerpt);
    const yumako = dump.capsule?.yumako;
    if (!yumako) throw new Error("The fixture lost its yumako");
    yumako.icon = "__space-age__/graphics/icons/yumako-fruit.png";
    const { data, icons } = run({ ...gameFiles(dump), "icons/yumako-fruit.webp": tree });
    expect(icons).toEqual({ "icons/yumako.webp": tree });
    expect(find(data.items, "yumako").icon).toBe("icons/yumako.webp");
  });
});

describe("the committed Factorio pack", () => {
  const folder = "packs/factorio";
  const files: Record<string, Uint8Array> = {
    "manifest.yaml": readFileSync(join(folder, "manifest.yaml")),
    "plugin/index.js": new Uint8Array(), // bundled at build time; only the data matters here
  };
  for (const name of readdirSync(join(folder, "data")))
    files[`data/${name}`] = readFileSync(join(folder, "data", name));
  const pack = readPackFiles(files);
  if (!pack.ok) throw new Error(pack.error.map((issue) => `${issue.path.join(" › ")}: ${issue.message}`).join("\n"));
  const { data } = pack.value;

  it("holds Factorio with Space Age", () => {
    expect(data.units).toEqual({ rate: "per_second" });
    expect(data.items.length).toBeGreaterThan(250);
    expect(data.recipes.length).toBeGreaterThan(550);
    expect(data.recipes.filter((recipe) => recipe.tags?.includes("space-age")).length).toBeGreaterThan(150);
    expect(data.recipes.filter((recipe) => recipe.tags?.includes("recycling")).length).toBeGreaterThan(250);
  });

  it("matches recipe rates from the game", () => {
    const plate = find(data.recipes, "iron-plate");
    expect(plate.buildings[0]).toBe("stone-furnace");
    expect(plate.time).toBe(3.2);
    expect(perSecond(plate.out["iron-plate"], plate.time / find(data.buildings, "stone-furnace").speed)).toBe(0.3125);

    const steel = find(data.recipes, "steel-plate");
    expect(steel).toMatchObject({ time: 16, in: { "iron-plate": 5 }, out: { "steel-plate": 1 } });

    const circuit = find(data.recipes, "electronic-circuit");
    expect(circuit).toMatchObject({ time: 0.5, in: { "iron-plate": 1, "copper-cable": 3 } });

    const oil = find(data.recipes, "advanced-oil-processing");
    expect(oil).toMatchObject({
      buildings: ["oil-refinery"],
      time: 5,
      in: { "crude-oil": 100, water: 50 },
      out: { "heavy-oil": 25, "light-oil": 45, "petroleum-gas": 55 },
    });
    expect(find(data.recipes, "rocket-part").buildings).toEqual(["rocket-silo"]);
  });

  it("matches machine speeds and power from the game", () => {
    const building = (id: string) => find(data.buildings, id);
    expect(building("stone-furnace").speed).toBe(1);
    expect(building("steel-furnace").speed).toBe(2);
    expect(building("electric-furnace").speed).toBe(2);
    expect(building("assembling-machine-1").speed).toBe(0.5);
    expect(building("assembling-machine-2").speed).toBe(0.75);
    expect(building("assembling-machine-3").speed).toBe(1.25);
    expect(building("foundry").speed).toBe(4);
    expect(building("electric-mining-drill").speed).toBe(0.5);
    expect(building("assembling-machine-1").power).toEqual({ consume: 0.0775 });
    expect(building("electric-furnace").power).toEqual({ consume: 0.186 });
  });

  it("matches belt and pipe throughput from the game", () => {
    const capacity = (id: string) => find(data.logistics, id).capacity;
    expect(capacity("transport-belt")).toBe(15);
    expect(capacity("fast-transport-belt")).toBe(30);
    expect(capacity("express-transport-belt")).toBe(45);
    expect(capacity("turbo-transport-belt")).toBe(60);
    expect(capacity("pipe")).toBe(6000);
    expect(find(data.logistics, "transport-belt").aliases).toContain("yellow belt");
    expect(find(data.logistics, "fast-transport-belt").aliases).toContain("red belt");
    expect(find(data.logistics, "express-transport-belt").aliases).toContain("blue belt");
  });

  it("has an icon file for every icon it names", () => {
    // An item and the building it places share their id and their icon.
    const icons = new Set([...data.items, ...data.buildings].flatMap((entry) => (entry.icon ? [entry.icon] : [])));
    const qualityVariant = (id: string) => id.includes("@");
    expect(icons.size).toBeGreaterThan(data.items.filter((item) => !qualityVariant(item.id)).length * 0.9);
    for (const icon of icons) expect(existsSync(join(folder, icon)), icon).toBe(true);
    expect(readdirSync(join(folder, "icons"))).toHaveLength(icons.size); // and no icon nobody uses
  });
});
