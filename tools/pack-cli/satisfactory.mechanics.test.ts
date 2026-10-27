// Reference factories for the Satisfactory plugin's mechanics (clock speed, power shards, somersloops, alternates,
// the power curve), solved with the committed pack data and compared with what the game shows for them.
// Game rules, from the game's own data file (CommunityResources/Docs/en-US.json, Satisfactory 1.1):
// - mMaxPotential 1.0 and mMinPotential 0.01: clock speed 1 % to 100 %; each Power Shard adds mExtraPotential 0.5
//   (+50 %), three shards at most: 150 %, 200 %, 250 %.
// - Somersloops (mExtraProductionBoost 1.0) fill a building's mProductionShardSlotSize slots, each worth
//   mProductionShardBoostMultiplier (1 / slots): a full building makes twice as much from the same inputs.
// - Power use = mPowerConsumption × boost ^ mProductionBoostPowerConsumptionExponent (2)
//   × clock ^ mPowerConsumptionExponent (1.321929, log2 2.5: 250 % takes about 3.36 × the power).
// - Generators make mPowerProduction × clock, burning fuel in proportion.
// The tests live here because Vitest runs tests below tools/; the plugin ships with the pack.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Document, Node } from "../../src/contracts/document";
import { localRuntime } from "../../src/engines/compiler";
import { readPackFiles } from "../../src/engines/packs/files";
import { loadSolver, solve } from "../../src/engines/solver";
import plugin from "../../packs/satisfactory/plugin/index";

const folder = "packs/satisfactory";
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

/** Solves a factory of recipe nodes, each pinned to a machine count; rates come back per minute. */
async function factory(nodes: Record<string, RecipeNode>, settings: Record<string, unknown> = {}) {
  const document: Document = {
    format: "carbonara",
    version: 1,
    id: "reference",
    name: "Reference",
    pack: { id: "satisfactory", version: "1.0.0", hash: "h" },
    graph: { nodes, edges: {} },
    blueprints: {},
    layout: {},
    settings: { plugin: settings },
  };
  const compiled = await runtime.compile(document);
  const results = await compiled.results(await solve(compiled.model), 1);
  const perMinute = (rates: Record<string, number> = {}) =>
    Object.fromEntries(Object.entries(rates).map(([item, perSecond]) => [item, perSecond * 60]));
  return {
    node: (id: string) => {
      const node = results.nodes[id];
      return {
        machines: node?.activity,
        in: perMinute(node?.inputs),
        out: perMinute(node?.outputs),
        derived: node?.derived ?? {},
      };
    },
    problems: results.diagnostics.filter((diagnostic) => diagnostic.kind === "warning" || diagnostic.kind === "error"),
    diagnostics: results.diagnostics,
  };
}

const machines = (count: number) => ({ type: "machines" as const, count });
const close = (value: number, digits = 6) => expect.closeTo(value, digits);

beforeAll(async () => {
  await loadSolver(readFileSync(new URL("../../src/engines/solver/wasm/solver_bg.wasm", import.meta.url)));
});

describe("clock speed and the power curve", () => {
  it("runs a Constructor making Iron Plates at 100 %: 30 ingots in, 20 plates out, 4 MW", async () => {
    const run = await factory({ plates: { kind: "recipe", recipe: "iron-plate", pin: machines(1) } });
    expect(run.node("plates")).toEqual({
      machines: close(1),
      in: { "iron-ingot": close(30) },
      out: { "iron-plate": close(20) },
      derived: { power: close(4) },
    });
    expect(run.problems).toEqual([]);
  });

  it("overclocks to 250 % with three power shards: 75 ingots in, 50 plates out, 13.43 MW", async () => {
    const run = await factory({
      plates: { kind: "recipe", recipe: "iron-plate", fields: { clock: 250, shards: 3 }, pin: machines(1) },
    });
    // 4 MW × 2.5 ^ 1.321929; the game shows 13.4 MW.
    expect(run.node("plates")).toMatchObject({
      in: { "iron-ingot": close(75) },
      out: { "iron-plate": close(50) },
      derived: { power: close(13.431, 3) },
    });
  });

  it("underclocks a Smelter to 50 %: 15 ingots a minute for 1.6 MW", async () => {
    const run = await factory({
      ingots: { kind: "recipe", recipe: "iron-ingot", fields: { clock: 50 }, pin: machines(1) },
    });
    expect(run.node("ingots")).toMatchObject({ out: { "iron-ingot": close(15) }, derived: { power: close(1.6, 4) } });
  });

  it("caps the clock at what the node's power shards allow, and says so", async () => {
    const run = await factory({
      plates: { kind: "recipe", recipe: "iron-plate", fields: { clock: 180, shards: 1 }, pin: machines(1) },
    });
    expect(run.node("plates")).toMatchObject({ out: { "iron-plate": close(30) } });
    expect(run.problems).toEqual([
      { kind: "warning", node: "plates", message: "Clock speed 180 % needs 2 power shards; running at 150 %" },
    ]);
  });

  it("draws power for a fractional machine count as the game would build it: whole machines plus one slower", async () => {
    // 2.5 Constructors: two at 100 % (8 MW) and one at 50 % (1.6 MW).
    const run = await factory({ plates: { kind: "recipe", recipe: "iron-plate", pin: machines(2.5) } });
    expect(run.node("plates")).toMatchObject({ out: { "iron-plate": close(50) }, derived: { power: close(9.6, 4) } });
  });

  it("runs generators linearly: a Coal-Powered Generator at 250 % burns 37.5 coal for 187.5 MW", async () => {
    const full = await factory({ power: { kind: "recipe", recipe: "coal-powered-generator-coal", pin: machines(1) } });
    expect(full.node("power")).toEqual({
      machines: close(1),
      in: { coal: close(15), water: close(45) },
      out: {},
      derived: { powerGenerated: close(75) },
    });
    const overclocked = await factory({
      power: {
        kind: "recipe",
        recipe: "coal-powered-generator-coal",
        fields: { clock: 250, shards: 3 },
        pin: machines(1),
      },
    });
    expect(overclocked.node("power")).toMatchObject({
      in: { coal: close(37.5), water: close(112.5) },
      derived: { powerGenerated: close(187.5) },
    });
  });
});

describe("somersloops", () => {
  it("double an Assembler's output with both slots filled, for four times the power", async () => {
    const run = await factory({
      plates: { kind: "recipe", recipe: "reinforced-iron-plate", fields: { somersloops: 2 }, pin: machines(1) },
    });
    // Reinforced Iron Plate: 30 plates and 60 screws make 5 a minute; amplified, 10. 15 MW × 2².
    expect(run.node("plates")).toEqual({
      machines: close(1),
      in: { "iron-plate": close(30), screws: close(60) },
      out: { "reinforced-iron-plate": close(10) },
      derived: { power: close(60) },
    });
  });

  it("add a quarter each in a Manufacturer's four slots", async () => {
    const run = await factory({
      computers: { kind: "recipe", recipe: "computer", fields: { somersloops: 1 }, pin: machines(1) },
    });
    // 2.5 computers a minute × 1.25; 55 MW × 1.25².
    expect(run.node("computers")).toMatchObject({
      out: { computer: close(3.125) },
      derived: { power: close(85.9375) },
    });
  });

  it("combine with overclocking", async () => {
    const run = await factory({
      plates: {
        kind: "recipe",
        recipe: "iron-plate",
        fields: { clock: 200, shards: 2, somersloops: 1 },
        pin: machines(1),
      },
    });
    // 60 ingots in, 2 × 40 plates out; 4 MW × 2² × 2 ^ 1.321929.
    expect(run.node("plates")).toMatchObject({
      in: { "iron-ingot": close(60) },
      out: { "iron-plate": close(80) },
      derived: { power: close(16 * 2 ** 1.321929, 4) },
    });
  });

  it("stay within the save's somersloops when the budget is on", async () => {
    const nodes: Record<string, RecipeNode> = {
      a: { kind: "recipe", recipe: "reinforced-iron-plate", fields: { somersloops: 2 }, pin: machines(2) },
      b: { kind: "recipe", recipe: "iron-plate", fields: { somersloops: 1 }, pin: machines(1) },
    };
    const free = await factory(nodes, { limitSomersloops: false, somersloops: 3 });
    expect([free.node("a").machines, free.node("b").machines]).toEqual([close(2), close(1)]);
    // Five somersloops wanted, three available: the solver gives up the pins it can't meet.
    const limited = await factory(nodes, { limitSomersloops: true, somersloops: 3 });
    const used = 2 * (limited.node("a").machines ?? 0) + (limited.node("b").machines ?? 0);
    expect(used).toBeCloseTo(3, 6);
    expect(limited.diagnostics.some((diagnostic) => diagnostic.kind === "pinMiss")).toBe(true);
  });
});

describe("node fields", () => {
  it("offer clock speed and power shards everywhere, and somersloops where a building has slots", () => {
    const fields = (building: string) => {
      const found = pack.buildings.find((entry) => entry.id === building);
      if (!found) throw new Error(building);
      return plugin.nodeFields?.(found, { pack, settings: {} }) ?? {};
    };
    expect(fields("constructor")).toEqual({
      clock: { kind: "number", label: "Clock speed", min: 1, max: 250, step: 0.0001, unit: "%", default: 100 },
      shards: { kind: "number", label: "Power shards", min: 0, max: 3, step: 1, default: 0 },
      somersloops: { kind: "number", label: "Somersloops", min: 0, max: 1, step: 1, default: 0 },
    });
    expect(fields("manufacturer").somersloops).toMatchObject({ max: 4 });
    expect(fields("packager")).not.toHaveProperty("somersloops");
    expect(fields("coal-powered-generator")).not.toHaveProperty("somersloops");
  });
});

describe("alternate recipes and the save profile", () => {
  const pure = { kind: "recipe" as const, recipe: "alt-pure-iron-ingot", pin: machines(1) };

  it("are all unlocked while the document has no save profile", async () => {
    expect((await factory({ pure })).problems).toEqual([]);
    // 35 ore and 20 water make 65 ingots a minute.
    expect((await factory({ pure })).node("pure")).toMatchObject({
      in: { "iron-ore": close(35), water: close(20) },
      out: { "iron-ingot": close(65) },
    });
  });

  it("warn about alternates the save profile hasn't unlocked", async () => {
    expect((await factory({ pure }, { unlocked: [] })).problems).toEqual([
      { kind: "warning", node: "pure", message: "Alternate: Pure Iron Ingot isn't unlocked" },
    ]);
    expect((await factory({ pure }, { unlocked: ["alt-pure-iron-ingot"] })).problems).toEqual([]);
  });

  it("offer the somersloop budget as save settings", () => {
    expect(plugin.settingsFields?.({ pack, settings: {} })).toEqual({
      limitSomersloops: { kind: "toggle", label: "Limit somersloops", default: false },
      somersloops: { kind: "number", label: "Somersloops available", min: 0, max: 1000, step: 1, default: 0 },
    });
    expect(plugin.metrics).toEqual({
      power: { label: "Power use", unit: "MW" },
      powerGenerated: { label: "Power generated", unit: "MW" },
    });
  });
});
