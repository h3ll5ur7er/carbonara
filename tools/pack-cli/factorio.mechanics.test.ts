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
import type { Document, Node } from "../../src/contracts/document";
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

  it("burn fuel in burner buildings instead of drawing power: a Stone furnace burns 90 kW", async () => {
    const run = await factory({ plates: recipeNode("iron-plate", "stone-furnace", {}, 2.5) });
    expect(run.node("plates")).toEqual({
      machines: close(2.5),
      in: { "iron-ore": close(0.78125) },
      out: { "iron-plate": close(0.78125) },
      derived: { fuel: close(0.225) },
    });
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
  const quality = {
    kind: "choice",
    label: "Quality",
    options: ["normal", "uncommon", "rare", "epic", "legendary"],
    default: "normal",
  };

  it("offers module counts up to the slots, beacons, and the quality a node crafts at", () => {
    const count = (label: string, max: number) => ({ kind: "number", label, min: 0, max, step: 1, default: 0 });
    expect(fields("assembling-machine-3")).toEqual({
      speedModules: count("Speed modules", 4),
      productivityModules: count("Productivity modules", 4),
      efficiencyModules: count("Efficiency modules", 4),
      qualityModules: count("Quality modules", 4),
      moduleTier: tier("Module tier"),
      beacons: count("Beacons in range", 100),
      beaconSpeedModules: count("Speed modules per beacon", 2),
      beaconEfficiencyModules: count("Efficiency modules per beacon", 2),
      beaconModuleTier: tier("Beacon module tier"),
      machinesPerBeacon: { kind: "number", label: "Machines per beacon", min: 1, max: 12, step: 1, default: 1 },
      quality,
    });
  });

  it("offers only the modules a building takes, and no modules where it has no slots", () => {
    expect(Object.keys(fields("recycler"))).not.toContain("productivityModules");
    expect(Object.keys(fields("oil-refinery"))).not.toContain("qualityModules");
    expect(fields("assembling-machine-1")).toEqual({ quality });
    expect(fields("stone-furnace")).toEqual({ quality });
  });

  it("offers the Space Age setting and the power metrics", () => {
    expect(plugin.settingsFields?.({ pack, settings: {} })).toEqual({
      spaceAge: { kind: "toggle", label: "Space Age", default: true },
    });
    expect(plugin.metrics).toEqual({
      power: { label: "Power use", unit: "MW" },
      beaconPower: { label: "Beacon power", unit: "MW" },
      fuel: { label: "Fuel burnt", unit: "MW" },
    });
  });
});
