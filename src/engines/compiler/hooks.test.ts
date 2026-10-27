import { describe, expect, it } from "vitest";
import { ok } from "../../contracts/result";
import { definePlugin } from "../../contracts/plugin";
import type { Solution } from "../../contracts/solver";
import { compile } from "./compile";
import { describePlugin } from "./hooks";
import { fixturePlugin, smeltingWith } from "./hooks.fixture";
import { localRuntime } from "./runtime";
import { toResults } from "./results";
import { templatePack } from "./template.fixture";

const pack = templatePack();
const plugin = fixturePlugin;
/** The smelting furnace's index in the water loop's model (ids sorted). */
const SMELT = 4;

function compiled(...args: Parameters<typeof smeltingWith>) {
  return compile({ document: smeltingWith(...args), pack, plugin });
}

describe("node fields while compiling", () => {
  it("fills in the defaults of the fields a node leaves out", () => {
    expect(compiled({}).info[SMELT]?.context?.fields).toEqual({ speed: 100, mode: "steady", boosted: false });
  });

  it("hands valid values to the plugin as they are", () => {
    const { info, model, diagnostics } = compiled({ fields: { speed: 150, mode: "eager", boosted: true } });
    expect(info[SMELT]?.context?.fields).toEqual({ speed: 150, mode: "eager", boosted: true });
    expect(model.nodes[SMELT]?.rates).toEqual([
      { item: 4, perSecond: -0.5 },
      { item: 5, perSecond: 1 },
    ]);
    expect(diagnostics).toEqual([]);
  });

  it("replaces values that don't fit their field with the nearest allowed value or the default, and says so", () => {
    const { info, diagnostics } = compiled({ fields: { speed: 500, mode: "wild", boosted: "yes" } });
    expect(info[SMELT]?.context?.fields).toEqual({ speed: 200, mode: "steady", boosted: false });
    expect(diagnostics).toEqual([
      { kind: "warning", node: "smelt", message: "Speed 500 % is out of range; using 200 %" },
      { kind: "warning", node: "smelt", message: 'Mode "wild" isn\'t one of its options; using "steady"' },
      { kind: "warning", node: "smelt", message: 'Booster "yes" isn\'t on or off; using off' },
    ]);
    expect(compiled({ fields: { speed: "fast" } }).diagnostics).toEqual([
      { kind: "warning", node: "smelt", message: 'Speed "fast" isn\'t a number; using 100 %' },
    ]);
  });

  it("passes on values of fields the plugin doesn't declare", () => {
    expect(compiled({ fields: { note: "keep" } }).info[SMELT]?.context?.fields.note).toBe("keep");
  });
});

describe("the effective recipe", () => {
  it("is the recipe as the node runs it", () => {
    const { model } = compiled({ fields: { boosted: true } });
    expect(model.nodes[SMELT]?.rates).toEqual([
      { item: 4, perSecond: -1 / 3 },
      { item: 5, perSecond: 2 / 3 },
    ]);
  });

  it("leaves a node out when the plugin's recipe for it isn't a recipe", () => {
    const broken = definePlugin({ id: "broken", effectiveRecipe: ({ recipe }) => ({ ...recipe, time: 0 }) });
    const result = compile({ document: smeltingWith({}), pack, plugin: broken });
    expect(result.nodes).not.toContain("smelt");
    expect(result.diagnostics).toContainEqual({
      kind: "error",
      node: "smelt",
      message: "The pack's plugin made an invalid recipe for this node",
    });
  });
});

describe("the items a node's effective recipe uses", () => {
  it("are listed for nodes whose effective recipe takes or makes other items than the pack's recipe", () => {
    expect(compiled({ fields: { speed: 200 } }).effectiveItems).toEqual({
      smelt: { in: ["clean-ferrite", "coal"], out: ["iron-plate"] },
    });
  });

  it("are left out while every node uses its recipe's items, whatever the amounts", () => {
    expect(compiled({ fields: { speed: 150, boosted: true } }).effectiveItems).toBeUndefined();
    // The coal alternate burns coal already: more of it is no other item.
    expect(compiled({ recipe: "iron-plate-from-ore", fields: { speed: 200 } }).effectiveItems).toBeUndefined();
  });

  it("leave out items the effective recipe takes or makes none of", () => {
    const dropping = definePlugin({
      id: "dropping",
      effectiveRecipe: ({ recipe }) => ({ ...recipe, in: { ...recipe.in, "clean-ferrite": 0 } }),
    });
    const { effectiveItems } = compile({ document: smeltingWith({}), pack, plugin: dropping });
    expect(effectiveItems?.smelt).toEqual({ in: [], out: ["iron-plate"] });
  });

  it("come with the results, solved or not", () => {
    const fuelled = compiled({ fields: { speed: 200 } });
    const solution: Solution = {
      activity: fuelled.model.nodes.map(() => 1),
      flow: fuelled.model.edges.map(() => 0),
      surplus: [],
      deficit: [],
      overflow: [],
      pinMisses: [],
    };
    const items = { smelt: { in: ["clean-ferrite", "coal"], out: ["iron-plate"] } };
    expect(toResults(fuelled, ok(solution), plugin, 1).effectiveItems).toEqual(items);
    expect(toResults(fuelled, { ok: false, error: "infeasible" }, plugin, 1).effectiveItems).toEqual(items);
  });
});

describe("recipe availability", () => {
  it("warns about recipes the settings don't allow, and still solves them", () => {
    const locked = compiled({ recipe: "iron-plate-from-ore" });
    expect(locked.nodes).toContain("smelt");
    expect(locked.diagnostics).toContainEqual({
      kind: "warning",
      node: "smelt",
      message: "Iron Plate (Coal Smelting) isn't unlocked",
    });
    const unlocked = compiled({ recipe: "iron-plate-from-ore" }, { unlocked: ["iron-plate-from-ore"] });
    expect(unlocked.diagnostics.filter((diagnostic) => diagnostic.kind === "warning")).toEqual([]);
  });
});

describe("plugin constraints", () => {
  it("become constraints over the model's node activities", () => {
    const document = smeltingWith({ fields: { boosted: true } }, { boosters: 1 });
    document.graph.nodes.extra = { kind: "recipe", recipe: "copper-plate", building: "furnace" };
    document.graph.nodes.boosted = { kind: "recipe", recipe: "iron-plate", fields: { boosted: true } };
    const { nodes, model } = compile({ document, pack, plugin });
    expect(model.constraints).toEqual([
      {
        terms: [
          { node: nodes.indexOf("boosted"), coefficient: 1 },
          { node: nodes.indexOf("smelt"), coefficient: 1 },
        ],
        op: "atMost",
        rhs: 1,
      },
    ]);
  });

  it("leave out terms on nodes the model doesn't have, and constraints without terms", () => {
    const ghostly = definePlugin({
      id: "ghostly",
      constraints: () => [
        { terms: [{ node: "ghost", coefficient: 1 }], op: "atMost", rhs: 1 },
        {
          terms: [
            { node: "smelt", coefficient: 2 },
            { node: "plates", coefficient: 1 },
          ],
          op: "atLeast",
          rhs: 0,
        },
      ],
    });
    const { model } = compile({ document: smeltingWith({}), pack, plugin: ghostly });
    expect(model.constraints).toEqual([{ terms: [{ node: SMELT, coefficient: 2 }], op: "atLeast", rhs: 0 }]);
  });

  it("are refused when their numbers aren't finite", () => {
    const broken = definePlugin({
      id: "broken",
      constraints: () => [{ terms: [{ node: "smelt", coefficient: Number.NaN }], op: "equal", rhs: 1 }],
    });
    const { model, diagnostics } = compile({ document: smeltingWith({}), pack, plugin: broken });
    expect(model.constraints).toEqual([]);
    expect(diagnostics).toEqual([{ kind: "error", message: "The pack's plugin made an invalid constraint" }]);
  });
});

describe("validating nodes", () => {
  it("shows the plugin's warnings on the node", () => {
    expect(compiled({ fields: { mode: "eager", speed: 60 } }).diagnostics).toEqual([
      { kind: "warning", node: "smelt", message: "Eager furnaces want at least 100 %" },
    ]);
  });

  it("leaves out nodes the plugin finds an error in", () => {
    const strict = definePlugin({ id: "strict", validate: () => [{ kind: "error", message: "Not like this" }] });
    const result = compile({ document: smeltingWith({}), pack, plugin: strict });
    expect(result.nodes).not.toContain("smelt");
    expect(result.diagnostics).toContainEqual({ kind: "error", node: "smelt", message: "Not like this" });
  });
});

describe("describing a plugin for clients", () => {
  it("lists node fields by building, the settings and the metrics", () => {
    const description = describePlugin(pack, plugin, {});
    expect(Object.keys(description.nodeFields)).toEqual(["furnace"]);
    expect(description.nodeFields.furnace?.speed).toMatchObject({ kind: "number", default: 100 });
    expect(description.settingsFields).toEqual({
      boosters: { kind: "number", label: "Boosters", min: 0, max: 100, step: 1, default: 0 },
    });
    expect(description.metrics).toEqual({ power: { label: "Power", unit: "MW" } });
  });

  it("is empty for a plugin without hooks", () => {
    expect(describePlugin(pack, definePlugin({ id: "none" }), {})).toEqual({
      nodeFields: {},
      settingsFields: {},
      metrics: {},
    });
  });
});

describe("the local runtime", () => {
  it("compiles and maps results back exactly as the compiler does", async () => {
    const document = smeltingWith({ fields: { speed: 150 } });
    const direct = compile({ document, pack, plugin });
    const compiledHere = await localRuntime(pack, plugin).compile(document);
    expect(compiledHere.model).toEqual(direct.model);
    const solution: Solution = {
      activity: direct.model.nodes.map(() => 1),
      flow: direct.model.edges.map(() => 0),
      surplus: [],
      deficit: [],
      overflow: [],
      pinMisses: [],
    };
    expect(await compiledHere.results(ok(solution), 3)).toEqual(toResults(direct, ok(solution), plugin, 3));
    expect((await compiledHere.results(ok(solution), 3)).nodes.smelt?.derived).toEqual({ power: 0.75 });
  });
});
