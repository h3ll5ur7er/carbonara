import { describe, expect, it } from "vitest";
import { Id, PackData, PackDataFile, PackManifest } from "./pack";

const manifest = {
  id: "satisfactory",
  name: "Satisfactory",
  version: "1.2.0",
  engine: "^1",
  game: { name: "Satisfactory", version: "1.1" },
  data: "data/",
  plugin: "plugin/index.js",
  theme: { accent: "#f5a623" },
};

const data = {
  units: { rate: "per_minute" },
  items: [
    { id: "iron-ore", name: "Iron Ore", form: "solid", icon: "icons/iron-ore.webp" },
    { id: "iron-ingot", name: "Iron Ingot", form: "solid" },
    { id: "water", name: "Water", form: "fluid" },
  ],
  buildings: [
    { id: "smelter", name: "Smelter", power: { consume: 4 }, fields: { clock: { min: 1, max: 250, default: 100 } } },
    { id: "refinery", name: "Refinery", power: { consume: 30 } },
  ],
  recipes: [
    { id: "iron-ingot", buildings: ["smelter"], time: 2, in: { "iron-ore": 1 }, out: { "iron-ingot": 1 } },
    {
      id: "alt-pure-iron-ingot",
      buildings: ["refinery"],
      time: 12,
      in: { "iron-ore": 7, water: 4 },
      out: { "iron-ingot": 13 },
      tags: ["alternate"],
    },
  ],
  logistics: [
    { id: "belt-mk1", name: "Conveyor Belt Mk.1", aliases: ["mk1 belt"], carries: "solid", capacity: 60 },
    { id: "pipe-mk1", carries: "fluid", capacity: 300 },
  ],
  resources: [{ item: "iron-ore", limit: 92100, extractors: ["smelter"] }],
};

describe("PackManifest", () => {
  it("accepts the example from the wiki", () => {
    expect(PackManifest.parse(manifest)).toMatchObject({ id: "satisfactory", plugin: "plugin/index.js" });
  });

  it("defaults the data folder", () => {
    const { data: _data, ...rest } = manifest;
    expect(PackManifest.parse(rest).data).toBe("data/");
  });

  it.each([
    ["a version that isn't semver", { version: "1.2" }, ["version"]],
    ["an engine range it can't read", { engine: ">=1 <2" }, ["engine"]],
    ["an id with capitals", { id: "Satisfactory" }, ["id"]],
    ["an accent that isn't a hex colour", { theme: { accent: "orange" } }, ["theme", "accent"]],
    ["a missing plugin entry", { plugin: undefined }, ["plugin"]],
  ])("rejects %s", (_name, change, path) => {
    const result = PackManifest.safeParse({ ...manifest, ...change });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(path);
  });
});

describe("PackData", () => {
  it("accepts the example from the wiki", () => {
    const parsed = PackData.parse(data);
    expect(parsed.recipes).toHaveLength(2);
    expect(parsed.buildings[0]?.speed).toBe(1);
  });

  it("defaults empty sections and the rate unit", () => {
    expect(PackData.parse({})).toEqual({
      units: { rate: "per_minute" },
      items: [],
      buildings: [],
      recipes: [],
      logistics: [],
      resources: [],
    });
  });

  it("accepts item variants and fractional expected outputs", () => {
    const recipe = {
      id: "recycle",
      buildings: ["recycler"],
      time: 1,
      in: { "gear@rare": 1 },
      out: { "plate@rare": 0.25 },
    };
    expect(PackData.safeParse({ recipes: [recipe] }).success).toBe(true);
  });

  it.each([
    ["a recipe without a building", { recipes: [{ ...data.recipes[0], buildings: [] }] }, ["recipes", 0, "buildings"]],
    ["a recipe that takes no time", { recipes: [{ ...data.recipes[0], time: 0 }] }, ["recipes", 0, "time"]],
    [
      "a negative amount",
      { recipes: [{ ...data.recipes[0], in: { "iron-ore": -1 } }] },
      ["recipes", 0, "in", "iron-ore"],
    ],
    ["an unknown item form", { items: [{ id: "x", name: "X", form: "plasma" }] }, ["items", 0, "form"]],
    ["an unknown rate unit", { units: { rate: "per_day" } }, ["units", "rate"]],
  ])("rejects %s", (_name, value, path) => {
    const result = PackData.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(path);
  });
});

describe("PackDataFile", () => {
  it("accepts a file with only some sections", () => {
    expect(PackDataFile.parse({ items: data.items })).toEqual({ items: PackData.parse(data).items });
  });
});

describe("Id", () => {
  // CARB-83: ids are the games' own names, so the format keeps `constructor` (Satisfactory's building) and the code
  // reads records by own keys only. The pattern refuses every other key a plain object inherits anyway.
  it("allows constructor, the only Object.prototype key that fits the pattern", () => {
    const allowed = Object.getOwnPropertyNames(Object.prototype).filter((key) => Id.safeParse(key).success);
    expect(allowed).toEqual(["constructor"]);
  });
});
