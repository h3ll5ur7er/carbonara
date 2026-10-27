// Reference factories for the Factorio plugin's mechanics (modules, beacons, built-in productivity, quality, the
// Space Age setting, power), solved with the committed pack data and compared with the game's numbers.
// Game rules, from the Lua prototypes of Factorio 2.1.14 (wube/factorio-data, see the pack's CREDITS.md) and the
// prototype API (lua-api.factorio.com, EffectReceiver):
// - Modules (base/prototypes/item.lua, quality/prototypes/item.lua): speed module 3 +50 % speed, +70 % consumption,
//   -2.5 % quality; productivity module 3 +10 % productivity, -15 % speed, +80 % consumption; efficiency module 3
//   -50 % consumption; quality module 3 +2.5 % quality, -5 % speed. Tiers 1 and 2 are weaker.
// - Effects add up. Speed and consumption stop at -80 %; productivity and quality at 0. Productivity only on recipes
//   that allow it, and only on the part of a result that isn't `ignored_by_productivity`.
// - Beacons (base/prototypes/entity/entities.lua): 2 module slots, distribution effectivity 1.5, 480 kW. With n
//   beacons in range, each passes on its modules' effects × 1.5 × profile[n] (1, 0.7071, 0.5773, 0.5 …: 1/√n cut
//   to four decimals).
// - Machines draw energy_usage × (1 + consumption), plus a drain of 1/30 of it whenever they're built.
// - Quality (quality/prototypes/quality.lua): a craft gets one level better with the quality chance, then each
//   further level with 10 % (chain_probability), up to legendary.
// Rates are per second, as in the game. The tests live here because Vitest runs tests below tools/.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Document, Edge, Node } from "../../src/contracts/document";
import { localRuntime } from "../../src/engines/compiler";
import { readPackFiles } from "../../src/engines/packs/files";
import { loadSolver, solve } from "../../src/engines/solver";
import plugin from "../../packs/factorio/plugin/index";

const folder = "packs/factorio";
const files: Record<string, Uint8Array> = {
  "manifest.yaml": readFileSync(join(folder, "manifest.yaml")),
  "plugin/index.js": new Uint8Array(),
};
for (const name of readdirSync(join(folder, "data"))) files[`data/${name}`] = readFileSync(join(folder, "data", name));
const read = readPackFiles(files);
if (!read.ok) throw new Error(JSON.stringify(read.error));
const pack = read.value.data;
const runtime = localRuntime(pack, plugin);

type RecipeNode = Extract<Node, { kind: "recipe" }>;

function building(id: string) {
  const found = pack.buildings.find((entry) => entry.id === id);
  if (!found) throw new Error(id);
  return found;
}

/** Solves a factory of recipe nodes, each pinned to a machine count; rates come back per second. */
async function factory(nodes: Record<string, RecipeNode>, settings: Record<string, unknown> = {}) {
  const document: Document = {
    format: "carbonara",
    version: 1,
    id: "reference",
    name: "Reference",
    pack: { id: "factorio", version: "1.0.0", hash: "h" },
    graph: { nodes, edges: {} },
    blueprints: {},
    layout: {},
    settings: { plugin: settings },
  };
  const compiled = await runtime.compile(document);
  const results = await compiled.results(await solve(compiled.model), 1);
  return {
    node: (id: string) => {
      const node = results.nodes[id];
      return {
        machines: node?.activity,
        in: node?.inputs ?? {},
        out: node?.outputs ?? {},
        derived: node?.derived ?? {},
      };
    },
    problems: results.diagnostics.filter((diagnostic) => diagnostic.kind === "warning" || diagnostic.kind === "error"),
  };
}

const machines = (count: number) => ({ type: "machines" as const, count });
const close = (value: number, digits = 6) => expect.closeTo(value, digits);
const recipeNode = (recipe: string, building: string, fields: RecipeNode["fields"] = {}, count = 1): RecipeNode => ({
  kind: "recipe",
  recipe,
  building,
  fields,
  pin: machines(count),
});

beforeAll(async () => {
  await loadSolver(readFileSync(new URL("../../src/engines/solver/wasm/solver_bg.wasm", import.meta.url)));
});

describe("machines without modules", () => {
  it("run an Assembling machine 3 making gears: 5 plates in, 2.5 gears out, 375 kW plus 12.5 kW drain", async () => {
    const run = await factory({ gears: recipeNode("iron-gear-wheel", "assembling-machine-3") });
    expect(run.node("gears")).toEqual({
      machines: close(1),
      in: { "iron-plate": close(5) },
      out: { "iron-gear-wheel": close(2.5) },
      derived: { power: close(0.3875) },
    });
    expect(run.problems).toEqual([]);
  });

  it("draw the drain of every machine built: 2.5 machines are three, two and a half of them working", async () => {
    const run = await factory({ gears: recipeNode("iron-gear-wheel", "assembling-machine-3", {}, 2.5) });
    // 2.5 × 375 kW + 3 × 12.5 kW.
    expect(run.node("gears").derived).toEqual({ power: close(0.975) });
  });

  it("burn fuel in burner buildings instead of drawing power: a Stone furnace burns 90 kW of coal", async () => {
    const run = await factory({ plates: recipeNode("iron-plate", "stone-furnace", {}, 2.5) });
    // 2.5 × 90 kW = 225 kW: 0.05625 coal (4 MJ) a second.
    expect(run.node("plates")).toEqual({
      machines: close(2.5),
      in: { "iron-ore": close(0.78125), coal: close(0.05625) },
      out: { "iron-plate": close(0.78125) },
      derived: {},
    });
  });

  it("burn the fuel a node picks: wood (2 MJ) twice as fast as coal, nutrients in a Biochamber", async () => {
    const run = await factory({
      plates: recipeNode("iron-plate", "stone-furnace", { fuel: "wood" }),
      mash: recipeNode("yumako-processing", "biochamber"),
    });
    expect(run.node("plates").in).toEqual({ "iron-ore": close(0.3125), wood: close(0.045) });
    // 500 kW of nutrients (2 MJ).
    expect(run.node("mash").in).toMatchObject({ nutrients: close(0.25) });
  });

  it("burn more fuel with the consumption effects of their modules", async () => {
    const run = await factory({
      mash: recipeNode("yumako-processing", "biochamber", { speedModules: 4, moduleTier: "3" }),
    });
    // Consumption +280 %: 1.9 MW of nutrients.
    expect(run.node("mash").in).toMatchObject({ nutrients: close(0.95) });
  });
});

describe("modules", () => {
  it("speed an Assembling machine 3 up by 200 % with four speed modules 3, for 280 % more power", async () => {
    const run = await factory({
      gears: recipeNode("iron-gear-wheel", "assembling-machine-3", { speedModules: 4, moduleTier: "3" }),
    });
    // Crafting speed 1.25 × 3 = 3.75: 7.5 gears a second. 375 kW × 3.8 + 12.5 kW. Quality can't go below 0.
    expect(run.node("gears")).toEqual({
      machines: close(1),
      in: { "iron-plate": close(15) },
      out: { "iron-gear-wheel": close(7.5) },
      derived: { power: close(1.4375) },
    });
  });

  it("make an Electric furnace with two productivity modules 3 give 20 % more plates, 30 % slower", async () => {
    const run = await factory({
      plates: recipeNode("iron-plate", "electric-furnace", { productivityModules: 2, moduleTier: "3" }),
    });
    // Crafting speed 2 × 0.7 = 1.4: 0.4375 crafts a second of 3.2 s. 180 kW × 2.6 + 6 kW.
    expect(run.node("plates")).toEqual({
      machines: close(1),
      in: { "iron-ore": close(0.4375) },
      out: { "iron-plate": close(0.525) },
      derived: { power: close(0.474) },
    });
  });

  it("take tiers 1 and 2: two speed modules 1 in an Assembling machine 2, two productivity modules 2 in a furnace", async () => {
    const run = await factory({
      gears: recipeNode("iron-gear-wheel", "assembling-machine-2", { speedModules: 2, moduleTier: "1" }),
      plates: recipeNode("iron-plate", "electric-furnace", { productivityModules: 2, moduleTier: "2" }),
    });
    // 0.75 × 1.4 = 1.05: 2.1 gears a second; 150 kW × 2 + 5 kW.
    expect(run.node("gears")).toMatchObject({
      out: { "iron-gear-wheel": close(2.1) },
      derived: { power: close(0.305) },
    });
    // 2 × 0.8 = 1.6: 0.5 crafts a second, × 1.12; 180 kW × 2.2 + 6 kW.
    expect(run.node("plates")).toMatchObject({
      in: { "iron-ore": close(0.5) },
      out: { "iron-plate": close(0.56) },
      derived: { power: close(0.402) },
    });
  });

  it("save at most 80 % power: four efficiency modules 3 bring 375 kW down to 75 kW", async () => {
    const run = await factory({
      gears: recipeNode("iron-gear-wheel", "assembling-machine-3", { efficiencyModules: 4, moduleTier: "3" }),
    });
    expect(run.node("gears")).toMatchObject({
      out: { "iron-gear-wheel": close(2.5) },
      derived: { power: close(0.0875) },
    });
  });

  it("slow a machine by at most 80 %: eight productivity modules 3 in a Cryogenic plant", async () => {
    const run = await factory({
      plastic: recipeNode("plastic-bar", "cryogenic-plant", { productivityModules: 8, moduleTier: "3" }),
    });
    // -120 % speed stops at -80 %: 2 × 0.2 = 0.4 crafts a second, each making 2 × 1.8 bars. 1.5 MW × 7.4 + 50 kW.
    expect(run.node("plastic")).toEqual({
      machines: close(1),
      in: { "petroleum-gas": close(8), coal: close(0.4) },
      out: { "plastic-bar": close(1.44) },
      derived: { power: close(11.15) },
    });
  });

  it("add productivity only to what a result doesn't carry over: Kovarex with two productivity modules 3", async () => {
    const run = await factory({
      kovarex: recipeNode("kovarex-enrichment-process", "centrifuge", { productivityModules: 2, moduleTier: "3" }),
    });
    // 60 s at crafting speed 0.7. 41 U-235 out of which 40 are the catalyst: +20 % of 1; U-238 2, all catalyst.
    const crafts = 0.7 / 60;
    expect(run.node("kovarex")).toMatchObject({
      in: { "uranium-235": close(40 * crafts), "uranium-238": close(5 * crafts) },
      out: { "uranium-235": close(41.2 * crafts), "uranium-238": close(2 * crafts) },
    });
  });

  it("leave productivity modules out of recipes that don't take them, and say so", async () => {
    const run = await factory({
      belts: recipeNode("transport-belt", "assembling-machine-3", { productivityModules: 2, moduleTier: "3" }),
    });
    // As without modules: 2.5 crafts a second of 2 belts.
    expect(run.node("belts")).toMatchObject({
      out: { "transport-belt": close(5) },
      derived: { power: close(0.3875) },
    });
    expect(run.problems).toEqual([
      { kind: "warning", node: "belts", message: "Transport belt takes no productivity modules; leaving them out" },
    ]);
  });

  it("fill only the slots a building has, in field order, and say so", async () => {
    const run = await factory({
      gears: recipeNode("iron-gear-wheel", "assembling-machine-2", {
        speedModules: 2,
        productivityModules: 1,
        moduleTier: "3",
      }),
    });
    // Two speed modules 3: 0.75 × 2 = 1.5.
    expect(run.node("gears")).toMatchObject({ out: { "iron-gear-wheel": close(3) } });
    expect(run.problems).toEqual([
      {
        kind: "warning",
        node: "gears",
        message: "Assembling machine 2 has 2 module slots; leaving out 1 of 3 modules",
      },
    ]);
  });
});

describe("built-in productivity", () => {
  it("makes a Foundry cast 50 % more gears, and adds up with productivity modules", async () => {
    const plain = await factory({ gears: recipeNode("casting-iron-gear-wheel", "foundry") });
    // Crafting speed 4: 40 molten iron a second, 4 × 1.5 gears. 2.5 MW plus 83.3 kW drain.
    expect(plain.node("gears")).toEqual({
      machines: close(1),
      in: { "molten-iron": close(40) },
      out: { "iron-gear-wheel": close(6) },
      derived: { power: close(2.5 + 2.5 / 30) },
    });
    const moduled = await factory({
      gears: recipeNode("casting-iron-gear-wheel", "foundry", { productivityModules: 4, moduleTier: "3" }),
    });
    // 4 × 0.4 = 1.6 crafts a second, × 1.9; 2.5 MW × 4.2 + drain.
    expect(moduled.node("gears")).toMatchObject({
      in: { "molten-iron": close(16) },
      out: { "iron-gear-wheel": close(3.04) },
      derived: { power: close(10.5 + 2.5 / 30) },
    });
  });

  it("doesn't apply to recipes without productivity: an Electromagnetic plant making accumulators", async () => {
    const run = await factory({ accumulators: recipeNode("accumulator", "electromagnetic-plant") });
    // Crafting speed 2: 0.2 crafts a second of 10 s.
    expect(run.node("accumulators")).toMatchObject({ out: { accumulator: close(0.2) } });
  });
});

describe("beacons", () => {
  it("pass on 1.5 × their modules' effects, ÷ √n each: four beacons with two speed modules 3", async () => {
    const run = await factory({
      circuits: recipeNode("electronic-circuit", "assembling-machine-3", {
        productivityModules: 4,
        moduleTier: "3",
        beacons: 4,
        beaconSpeedModules: 2,
        beaconModuleTier: "3",
      }),
    });
    // Each beacon: 2 × 50 % × 1.5 × 0.5 = +75 % speed, 2 × 70 % × 0.75 = +105 % consumption. With the modules:
    // speed 1.25 × (1 + 3 - 0.6) = 4.25: 8.5 crafts a second, × 1.4. Power 375 kW × (1 + 4.2 + 3.2) + 12.5 kW;
    // the beacons 4 × 480 kW.
    expect(run.node("circuits")).toEqual({
      machines: close(1),
      in: { "iron-plate": close(8.5), "copper-cable": close(25.5) },
      out: { "electronic-circuit": close(11.9) },
      derived: { power: close(3.1625), beaconPower: close(1.92) },
    });
  });

  it("follow the prototype's profile, cut to four decimals: eight beacons pass on 424.20 %, not 1.5 × √8", async () => {
    const run = await factory({
      gears: recipeNode("iron-gear-wheel", "assembling-machine-3", {
        beacons: 8,
        beaconSpeedModules: 1,
        beaconModuleTier: "3",
      }),
    });
    // 8 × 1.5 × 0.3535 × 50 % = 212.1 % speed: 1.25 × 3.121 / 0.5 crafts a second.
    expect(run.node("gears").out).toEqual({ "iron-gear-wheel": close(7.8025) });
  });

  it("count the beacons built for power: shared by two machines, 2.5 machines with 8 in range need 12", async () => {
    const run = await factory({
      gears: recipeNode(
        "iron-gear-wheel",
        "assembling-machine-3",
        { beacons: 8, beaconEfficiencyModules: 2, beaconModuleTier: "1", machinesPerBeacon: 2 },
        2.5,
      ),
    });
    // Efficiency 1: 8 × 2 × -30 % × 1.5 × 0.3535 = -254.5 %, which stops at -80 %. 3 × 8 ÷ 2 beacons.
    expect(run.node("gears").derived).toEqual({
      power: close(2.5 * 0.375 * 0.2 + 3 * 0.0125),
      beaconPower: close(12 * 0.48),
    });
  });

  it("take speed and efficiency modules only, two per beacon", async () => {
    const run = await factory({
      gears: recipeNode("iron-gear-wheel", "assembling-machine-3", {
        beacons: 1,
        beaconSpeedModules: 2,
        beaconEfficiencyModules: 1,
        beaconModuleTier: "3",
      }),
    });
    // Two speed modules 3 at 1.5: +150 %.
    expect(run.node("gears").out).toEqual({ "iron-gear-wheel": close(6.25) });
    expect(run.problems).toEqual([
      { kind: "warning", node: "gears", message: "A beacon has 2 module slots; leaving out 1 of 3 modules" },
    ]);
  });
});

describe("quality", () => {
  it("upgrades 10 % of the gears with four quality modules 3, each further level with 10 % of the rest", async () => {
    const run = await factory({
      gears: recipeNode("iron-gear-wheel", "assembling-machine-3", { qualityModules: 4, moduleTier: "3" }),
    });
    // -20 % speed: 2 crafts a second. Q = 10 %: 90 % normal, then 9 %, 0.9 %, 0.09 % and 0.01 % legendary.
    expect(run.node("gears")).toEqual({
      machines: close(1),
      in: { "iron-plate": close(4) },
      out: {
        "iron-gear-wheel": close(1.8),
        "iron-gear-wheel@uncommon": close(0.18),
        "iron-gear-wheel@rare": close(0.018),
        "iron-gear-wheel@epic": close(0.0018),
        "iron-gear-wheel@legendary": close(0.0002),
      },
      derived: { power: close(0.3875) },
    });
  });

  it("crafts from ingredients of the node's quality and upgrades from there; fluids have no quality", async () => {
    const rare = await factory({
      gears: recipeNode("iron-gear-wheel", "assembling-machine-3", {
        qualityModules: 4,
        moduleTier: "3",
        quality: "rare",
      }),
      plastic: recipeNode("plastic-bar", "chemical-plant", { quality: "rare" }),
    });
    expect(rare.node("gears")).toMatchObject({
      in: { "iron-plate@rare": close(4) },
      out: {
        "iron-gear-wheel@rare": close(1.8),
        "iron-gear-wheel@epic": close(0.18),
        "iron-gear-wheel@legendary": close(0.02),
      },
    });
    expect(rare.node("plastic")).toMatchObject({
      in: { "petroleum-gas": close(20), "coal@rare": close(1) },
      out: { "plastic-bar@rare": close(2) },
    });
    const legendary = await factory({
      gears: recipeNode("iron-gear-wheel", "assembling-machine-3", {
        qualityModules: 4,
        moduleTier: "3",
        quality: "legendary",
      }),
    });
    expect(legendary.node("gears").out).toEqual({ "iron-gear-wheel@legendary": close(2) });
  });

  it("applies to the extra products of productivity, and loses chance to speed modules, in beacons too", async () => {
    const run = await factory({
      circuits: recipeNode("electronic-circuit", "assembling-machine-3", {
        productivityModules: 2,
        qualityModules: 2,
        moduleTier: "3",
        beacons: 1,
        beaconSpeedModules: 1,
        beaconModuleTier: "3",
      }),
    });
    // Speed 1 - 0.3 - 0.1 + 0.75 = 1.35: 1.25 × 1.35 / 0.5 = 3.375 crafts a second, × 1.2 circuits.
    // Q = 5 % - 1.5 × 2.5 % = 1.25 %.
    const circuits = 3.375 * 1.2;
    expect(run.node("circuits").out).toEqual({
      "electronic-circuit": close(circuits * 0.9875),
      "electronic-circuit@uncommon": close(circuits * 0.0125 * 0.9),
      "electronic-circuit@rare": close(circuits * 0.0125 * 0.09),
      "electronic-circuit@epic": close(circuits * 0.0125 * 0.009),
      "electronic-circuit@legendary": close(circuits * 0.0125 * 0.001),
    });
  });

  it("works in recyclers: a quarter of the ingredients back, upgraded the same way", async () => {
    const run = await factory({
      recycling: recipeNode("iron-gear-wheel-recycling", "recycler", {
        qualityModules: 4,
        moduleTier: "3",
        quality: "uncommon",
      }),
    });
    // Crafting speed 0.5 × 0.8 over 1/32 s: 12.8 gears a second, 6.4 plates back.
    expect(run.node("recycling")).toMatchObject({
      in: { "iron-gear-wheel@uncommon": close(12.8) },
      out: {
        "iron-plate@uncommon": close(5.76),
        "iron-plate@rare": close(0.576),
        "iron-plate@epic": close(0.0576),
        "iron-plate@legendary": close(0.0064),
      },
    });
  });

  it("stays normal in recipes that don't allow quality, and says so", async () => {
    const run = await factory({
      kovarex: recipeNode("kovarex-enrichment-process", "centrifuge", {
        qualityModules: 2,
        moduleTier: "3",
        quality: "rare",
      }),
    });
    expect(Object.keys(run.node("kovarex").out)).toEqual(["uranium-235", "uranium-238"]);
    expect(run.problems).toEqual([
      {
        kind: "warning",
        node: "kovarex",
        message: "Kovarex enrichment process has no quality; making it at normal quality without quality effects",
      },
    ]);
  });
});

describe("power generation", () => {
  // Rules, from the Lua prototypes of 2.1.14 and the Factorio wiki (Boiler, Steam engine, Steam turbine, Heat
  // exchanger, Nuclear reactor, Heating tower, Fusion reactor, Fusion generator; read 2026-10-27):
  // - A boiler burns 1.8 MW of fuel to heat 60 steam a second to 165 °C, from 6 water; a steam engine takes 30
  //   steam a second and makes 900 kW, a steam turbine 60 and 5.82 MW at 500 °C (1.8 MW at 165 °C).
  // - A heat exchanger turns 10 MW of heat into 103.09 steam at 500 °C. A nuclear reactor makes 40 MW of heat from a
  //   uranium fuel cell every 200 s, plus 100 % for each fuelled neighbour; a heating tower 40 MW from 16 MW of fuel.
  // - A fusion reactor makes 100 MW of plasma (4 a second at 1,000,000 °C) from a fusion power cell every 400 s and
  //   4 cold fluoroketone, drawing 10 MW; each neighbour adds 1,000,000 °C. A fusion generator makes 50 MW from 2
  //   plasma a second at 1,000,000 °C (1 at 2,000,000 °C), giving back as much hot fluoroketone.

  /** Solves a document: what's pinned is pinned, the rest follows the flows. */
  async function plant(nodes: Record<string, Node>, edges: Record<string, Edge>) {
    const document: Document = {
      format: "carbonara",
      version: 1,
      id: "plant",
      name: "Power plant",
      pack: { id: "factorio", version: "1.0.0", hash: "h" },
      graph: { nodes, edges },
      blueprints: {},
      layout: {},
      settings: {},
    };
    const compiled = await runtime.compile(document);
    const results = await compiled.results(await solve(compiled.model), 1);
    const problems = results.diagnostics.filter((diagnostic) => diagnostic.kind !== "surplus");
    expect(problems).toEqual([]);
    return (id: string) => results.nodes[id];
  }
  const flow = (from: string, to: string, item: string): Edge => ({ from, to, item });
  const source = (item: string): Node => ({ kind: "source", item });
  const sink = (item: string, targetPerSecond?: number): Node => ({
    kind: "sink",
    item,
    ...(targetPerSecond !== undefined && { targetPerSecond }),
  });
  const recipe = (id: string, fields: RecipeNode["fields"] = {}): RecipeNode => ({
    kind: "recipe",
    recipe: id,
    fields,
  });

  it("feeds two steam engines from one boiler: 1.8 MW from 0.45 coal and 6 water a second", async () => {
    const node = await plant(
      {
        water: source("water"),
        coal: source("coal"),
        boiler: recipe("boiler-steam"),
        engines: recipe("steam-engine-electricity@165"),
        grid: sink("electricity", 1.8),
      },
      {
        a: flow("water", "boiler", "water"),
        b: flow("coal", "boiler", "coal"),
        c: flow("boiler", "engines", "steam@165"),
        d: flow("engines", "grid", "electricity"),
      },
    );
    expect(node("boiler")?.activity).toBeCloseTo(1, 9);
    expect(node("engines")?.activity).toBeCloseTo(2, 9);
    expect(node("boiler")?.inputs).toEqual({ water: close(6), coal: close(0.45) });
    expect(node("boiler")?.outputs).toEqual({ "steam@165": close(60) });
  });

  it("makes 1.8 MW in a steam turbine from boiler steam, and 900 kW in an engine from hotter steam", async () => {
    const run = await factory({
      turbine: recipeNode("steam-turbine-electricity@165", "steam-turbine"),
      engine: recipeNode("steam-engine-electricity@500", "steam-engine"),
    });
    expect(run.node("turbine")).toMatchObject({ in: { "steam@165": close(60) }, out: { electricity: close(1.8) } });
    expect(run.node("engine")).toMatchObject({ in: { "steam@500": close(30) }, out: { electricity: close(0.9) } });
  });

  it("gets 480 MW out of a 2×2 reactor array: 48 heat exchangers and 82.5 turbines", async () => {
    const node = await plant(
      {
        cells: source("uranium-fuel-cell"),
        water: source("water"),
        // Each reactor of a 2×2 array has two neighbours: 3 × 40 MW.
        reactors: { ...recipe("nuclear-reactor-heat", { neighbours: 2 }), pin: machines(4) },
        exchangers: recipe("heat-exchanger-steam"),
        turbines: recipe("steam-turbine-electricity@500"),
        grid: sink("electricity", 480),
        spent: sink("depleted-uranium-fuel-cell"),
      },
      {
        a: flow("cells", "reactors", "uranium-fuel-cell"),
        b: flow("reactors", "exchangers", "heat"),
        c: flow("water", "exchangers", "water"),
        d: flow("exchangers", "turbines", "steam@500"),
        e: flow("turbines", "grid", "electricity"),
        f: flow("reactors", "spent", "depleted-uranium-fuel-cell"),
      },
    );
    // The bonus is free: four cells every 200 s, whatever the neighbours.
    expect(node("reactors")?.inputs).toEqual({ "uranium-fuel-cell": close(0.02) });
    expect(node("reactors")?.outputs).toEqual({ heat: close(480), "depleted-uranium-fuel-cell": close(0.02) });
    expect(node("exchangers")?.activity).toBeCloseTo(48, 6);
    expect(node("turbines")?.activity).toBeCloseTo(480 / 5.82, 6);
    expect(node("grid")?.inputs).toEqual({ electricity: close(480) });
  });

  it("makes 40 MW of heat in a heating tower from 4 coal a second, and gives it no neighbour bonus", async () => {
    const run = await factory({ tower: recipeNode("heating-tower-heat", "heating-tower") });
    expect(run.node("tower")).toMatchObject({ in: { coal: close(4) }, out: { heat: close(40) } });
    expect(plugin.nodeFields?.(building("heating-tower"), { pack, settings: {} })).not.toHaveProperty("neighbours");
  });

  it("feeds two fusion generators from one fusion reactor: 100 MW, its coolant going round", async () => {
    const node = await plant(
      {
        cells: source("fusion-power-cell"),
        coolant: source("fluoroketone-cold"),
        reactor: { ...recipe("fusion-reactor-plasma"), pin: machines(1) },
        generators: recipe("fusion-generator-electricity"),
        grid: sink("electricity"),
        hot: sink("fluoroketone-hot"),
      },
      {
        a: flow("cells", "reactor", "fusion-power-cell"),
        b: flow("coolant", "reactor", "fluoroketone-cold"),
        c: flow("reactor", "generators", "fusion-plasma@1000000"),
        d: flow("generators", "grid", "electricity"),
        e: flow("generators", "hot", "fluoroketone-hot"),
      },
    );
    expect(node("reactor")?.inputs).toEqual({ "fluoroketone-cold": close(4), "fusion-power-cell": close(0.0025) });
    expect(node("reactor")?.derived).toEqual({ power: close(10) });
    expect(node("generators")?.activity).toBeCloseTo(2, 9);
    expect(node("grid")?.inputs).toEqual({ electricity: close(100) });
    expect(node("hot")?.inputs).toEqual({ "fluoroketone-hot": close(4) });
  });

  it("makes plasma twice as hot with a neighbour: two linked reactors feed eight generators, 400 MW", async () => {
    const node = await plant(
      {
        cells: source("fusion-power-cell"),
        coolant: source("fluoroketone-cold"),
        reactors: { ...recipe("fusion-reactor-plasma", { neighbours: 1 }), pin: machines(2) },
        generators: recipe("fusion-generator-electricity", { plasma: "2000000" }),
        grid: sink("electricity"),
        hot: sink("fluoroketone-hot"),
      },
      {
        a: flow("cells", "reactors", "fusion-power-cell"),
        b: flow("coolant", "reactors", "fluoroketone-cold"),
        c: flow("reactors", "generators", "fusion-plasma@2000000"),
        d: flow("generators", "grid", "electricity"),
        e: flow("generators", "hot", "fluoroketone-hot"),
      },
    );
    expect(node("reactors")?.outputs).toEqual({ "fusion-plasma@2000000": close(8) });
    expect(node("generators")?.activity).toBeCloseTo(8, 9);
    expect(node("grid")?.inputs).toEqual({ electricity: close(400) });
    // As much coolant comes back as went in.
    expect(node("hot")?.inputs).toEqual({ "fluoroketone-hot": close(8) });
  });

  it("offers fuels, neighbours and the plasma temperature as node fields", () => {
    const fieldsOf = (id: string) => plugin.nodeFields?.(building(id), { pack, settings: {} }) ?? {};
    expect(fieldsOf("nuclear-reactor")).toMatchObject({
      fuel: { kind: "choice", label: "Fuel", options: ["uranium-fuel-cell"], default: "uranium-fuel-cell" },
      neighbours: { kind: "number", label: "Neighbours per reactor", min: 0, max: 4, default: 0 },
    });
    expect(fieldsOf("fusion-reactor")).toMatchObject({
      neighbours: { kind: "number", label: "Neighbours per reactor", min: 0, max: 8, step: 1, default: 0 },
    });
    expect(fieldsOf("fusion-generator")).toMatchObject({
      plasma: {
        kind: "choice",
        label: "Plasma temperature (°C)",
        options: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((millions) => `${millions}000000`),
        default: "1000000",
      },
    });
  });

  it("rounds a fusion reactor's neighbours to whole ones, and says so", async () => {
    const run = await factory({ reactor: recipeNode("fusion-reactor-plasma", "fusion-reactor", { neighbours: 1.5 }) });
    expect(run.node("reactor").out).toEqual({ "fusion-plasma@2000000": close(4) });
    expect(run.problems).toEqual([
      { kind: "warning", node: "reactor", message: "A fusion reactor has whole neighbours; counting 1, not 1.5" },
    ]);
  });
});

describe("productivity research", () => {
  // Infinite research (the technologies' `change-recipe-productivity` effects, 2.1.14 dump) adds 10 % per level to
  // the recipes it names, beside modules and wherever modules can't go; the total stops at the recipe's
  // `maximum_productivity`, +300 % (EffectReceiver, lua-api.factorio.com).

  it("adds 10 % per level to the recipes it improves: steel at level 5 comes out 50 % more", async () => {
    const run = await factory(
      { steel: recipeNode("steel-plate", "electric-furnace") },
      { "steel-plate-productivity": 5 },
    );
    // Crafting speed 2 over 16 s: 0.125 crafts a second of 5 plates.
    expect(run.node("steel")).toMatchObject({
      in: { "iron-plate": close(0.625) },
      out: { "steel-plate": close(0.1875) },
    });
    expect(run.problems).toEqual([]);
  });

  it("stops at the recipe's maximum productivity, +300 %", async () => {
    const run = await factory(
      { steel: recipeNode("steel-plate", "electric-furnace") },
      { "steel-plate-productivity": 35 },
    );
    expect(run.node("steel").out).toEqual({ "steel-plate": close(0.5) });
  });

  it("counts where modules can't add productivity: scrap recycling in a recycler", async () => {
    const plain = await factory({ scrap: recipeNode("scrap-recycling", "recycler") });
    const researched = await factory(
      { scrap: recipeNode("scrap-recycling", "recycler") },
      { "scrap-recycling-productivity": 10 },
    );
    for (const [item, amount] of Object.entries(plain.node("scrap").out)) {
      expect(researched.node("scrap").out[item]).toBeCloseTo(amount * 2, 9);
    }
  });

  it("is a save setting per research, in levels", () => {
    expect(plugin.settingsFields?.({ pack, settings: {} })).toMatchObject({
      "steel-plate-productivity": {
        kind: "number",
        label: "Steel plate productivity",
        min: 0,
        max: 30,
        step: 1,
        unit: "levels",
        default: 0,
      },
      "scrap-recycling-productivity": { label: "Scrap recycling productivity" },
    });
  });
});

describe("quality of machines, modules and beacons", () => {
  // Each quality level (uncommon 1, rare 2, epic 3, legendary 5) adds 30 % crafting speed, 30 % to the positive
  // effects of modules (rounded down to 1 %, to 0.1 % for quality), 30 % to what boilers, engines, turbines and
  // reactors make and burn, and 0.2 to a beacon's distribution effectivity, whose power falls by a sixth (the
  // Factorio wiki's Quality page, read 2026-10-27; `distribution_effectivity_bonus_per_quality_level` and
  // `beacon_power_usage_multiplier` in the 2.1.14 dump).

  it("speeds a legendary Assembling machine 3 up 150 % for the same power", async () => {
    const run = await factory({
      gears: recipeNode("iron-gear-wheel", "assembling-machine-3", { machineQuality: "legendary" }),
    });
    expect(run.node("gears")).toEqual({
      machines: close(1),
      in: { "iron-plate": close(12.5) },
      out: { "iron-gear-wheel": close(6.25) },
      derived: { power: close(0.3875) },
    });
  });

  it("strengthens only what modules are for: legendary speed modules 3 add 125 % each, cost as much power", async () => {
    const run = await factory({
      gears: recipeNode("iron-gear-wheel", "assembling-machine-3", {
        speedModules: 4,
        moduleTier: "3",
        moduleQuality: "legendary",
      }),
    });
    // 1.25 × 6 = 7.5 crafts a second; consumption +280 % as at normal quality.
    expect(run.node("gears")).toMatchObject({
      out: { "iron-gear-wheel": close(15) },
      derived: { power: close(1.4375) },
    });
  });

  it("rounds stronger modules down: productivity 1 at uncommon gives 5 %, quality 3 at uncommon 3.2 %", async () => {
    const run = await factory({
      plates: recipeNode("iron-plate", "electric-furnace", {
        productivityModules: 2,
        moduleTier: "1",
        moduleQuality: "uncommon",
      }),
      gears: recipeNode("iron-gear-wheel", "assembling-machine-3", {
        qualityModules: 4,
        moduleTier: "3",
        moduleQuality: "uncommon",
      }),
    });
    // 4 % × 1.3 = 5.2 %, rounded down to 5 %; their -5 % speed stays. 2 × 0.9 / 3.2 crafts a second.
    expect(run.node("plates").out).toEqual({ "iron-plate": close(0.5625 * 1.1) });
    // 2.5 % × 1.3 = 3.25 %, rounded down to 3.2 %: Q = 12.8 %.
    expect(run.node("gears").out).toMatchObject({
      "iron-gear-wheel": close(2 * 0.872),
      "iron-gear-wheel@uncommon": close(2 * 0.128 * 0.9),
    });
  });

  it("makes a legendary beacon pass on 2.5 times its modules' effects, for a sixth of the power", async () => {
    const run = await factory({
      gears: recipeNode("iron-gear-wheel", "assembling-machine-3", {
        beacons: 1,
        beaconSpeedModules: 2,
        beaconModuleTier: "3",
        beaconQuality: "legendary",
      }),
    });
    // 2 × 50 % × 2.5 = +250 % speed: 1.25 × 3.5 / 0.5 crafts a second. 480 kW ÷ 6.
    expect(run.node("gears")).toMatchObject({
      out: { "iron-gear-wheel": close(8.75) },
      derived: { beaconPower: close(0.08) },
    });
  });

  it("makes generators make and burn 30 % more per level: an uncommon boiler, a legendary heating tower", async () => {
    const run = await factory({
      boiler: recipeNode("boiler-steam", "boiler", { machineQuality: "uncommon" }),
      tower: recipeNode("heating-tower-heat", "heating-tower", { machineQuality: "legendary" }),
      turbine: recipeNode("steam-turbine-electricity@500", "steam-turbine", { machineQuality: "rare" }),
    });
    expect(run.node("boiler")).toMatchObject({
      in: { water: close(7.8), coal: close(0.585) },
      out: { "steam@165": close(78) },
    });
    // 100 MW of heat from 40 MW of coal.
    expect(run.node("tower")).toMatchObject({ in: { coal: close(10) }, out: { heat: close(100) } });
    expect(run.node("turbine")).toMatchObject({
      in: { "steam@500": close(96) },
      out: { electricity: close(9.312) },
    });
  });

  it("warns without Space Age", async () => {
    const run = await factory(
      { gears: recipeNode("iron-gear-wheel", "assembling-machine-3", { machineQuality: "rare" }) },
      { spaceAge: false },
    );
    expect(run.problems).toEqual([{ kind: "warning", node: "gears", message: "Quality needs Space Age" }]);
  });
});

describe("the Space Age setting", () => {
  it("is on by default: expansion recipes and buildings plan without warnings", async () => {
    const run = await factory({
      casting: recipeNode("casting-iron-gear-wheel", "foundry"),
      circuits: recipeNode("electronic-circuit", "electromagnetic-plant"),
    });
    expect(run.problems).toEqual([]);
  });

  it("off, warns about expansion recipes, buildings and quality, but still solves them", async () => {
    const run = await factory(
      {
        casting: recipeNode("casting-iron-gear-wheel", "foundry"),
        circuits: recipeNode("electronic-circuit", "electromagnetic-plant"),
        gears: recipeNode("iron-gear-wheel", "assembling-machine-3", { qualityModules: 1 }),
        plates: recipeNode("iron-plate", "electric-furnace"),
      },
      { spaceAge: false },
    );
    expect(run.problems).toEqual([
      { kind: "warning", node: "casting", message: "Casting iron gear wheel isn't unlocked" },
      { kind: "warning", node: "casting", message: "Foundry needs Space Age" },
      { kind: "warning", node: "circuits", message: "Electromagnetic plant needs Space Age" },
      { kind: "warning", node: "gears", message: "Quality needs Space Age" },
    ]);
    expect(run.node("casting").out).toEqual({ "iron-gear-wheel": close(6) });
  });
});

describe("plugin description", () => {
  const fields = (building: string) => {
    const found = pack.buildings.find((entry) => entry.id === building);
    if (!found) throw new Error(building);
    return plugin.nodeFields?.(found, { pack, settings: {} }) ?? {};
  };
  const tier = (label: string) => ({ kind: "choice", label, options: ["1", "2", "3"], default: "3" });
  const ofQuality = (label: string) => ({
    kind: "choice",
    label,
    options: ["normal", "uncommon", "rare", "epic", "legendary"],
    default: "normal",
  });
  const quality = ofQuality("Quality");

  it("offers module counts up to the slots, beacons, and the quality a node crafts at", () => {
    const count = (label: string, max: number) => ({ kind: "number", label, min: 0, max, step: 1, default: 0 });
    expect(fields("assembling-machine-3")).toEqual({
      speedModules: count("Speed modules", 4),
      productivityModules: count("Productivity modules", 4),
      efficiencyModules: count("Efficiency modules", 4),
      qualityModules: count("Quality modules", 4),
      moduleTier: tier("Module tier"),
      moduleQuality: ofQuality("Module quality"),
      beacons: count("Beacons in range", 100),
      beaconSpeedModules: count("Speed modules per beacon", 2),
      beaconEfficiencyModules: count("Efficiency modules per beacon", 2),
      beaconModuleTier: tier("Beacon module tier"),
      beaconModuleQuality: ofQuality("Beacon module quality"),
      beaconQuality: ofQuality("Beacon quality"),
      machinesPerBeacon: { kind: "number", label: "Machines per beacon", min: 1, max: 12, step: 1, default: 1 },
      machineQuality: ofQuality("Machine quality"),
      quality,
    });
  });

  it("offers only the modules a building takes, and no modules where it has no slots", () => {
    expect(Object.keys(fields("recycler"))).not.toContain("productivityModules");
    expect(Object.keys(fields("oil-refinery"))).not.toContain("qualityModules");
    expect(fields("assembling-machine-1")).toEqual({ machineQuality: ofQuality("Machine quality"), quality });
    expect(fields("stone-furnace")).toEqual({
      fuel: {
        kind: "choice",
        label: "Fuel",
        options: expect.arrayContaining(["coal", "wood", "solid-fuel", "rocket-fuel", "nuclear-fuel"]),
        default: "coal",
      },
      machineQuality: ofQuality("Machine quality"),
      quality,
    });
  });

  it("offers the Space Age setting and the power metrics", () => {
    expect(plugin.settingsFields?.({ pack, settings: {} })).toMatchObject({
      spaceAge: { kind: "toggle", label: "Space Age", default: true },
    });
    expect(plugin.metrics).toEqual({
      power: { label: "Power use", unit: "MW" },
      beaconPower: { label: "Beacon power", unit: "MW" },
    });
  });
});
