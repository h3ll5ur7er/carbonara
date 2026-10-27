# Plugin authoring

A pack's plugin teaches Carbonara the game's mechanics: settings on machines, settings for the whole save, recipes that change with those settings, budgets, and numbers worked out after the solve. This guide gives the kilns of *Brick Works* (the pack from [[Guides/Pack authoring]]) a temperature: hotter kilns fire faster but burn more wood, above 1100 °C they need a lining, and a save can cap how many kilns it has.

Every pack has a plugin; a game without mechanics keeps the one `carbonara-pack new` writes, which does nothing. The API is [[src/contracts/plugin.ts]]; how the compiler calls it, and how the app keeps third-party plugins in a sandbox, is on [[Architecture/Plugins]].

[TOC]

## The rules

- **Every hook is optional and pure.** It gets the pack data and the document's plugin settings and returns values. It never changes the document, never reads storage, the network or the clock, and never draws UI: the inspector renders your settings from descriptions.
- **Your answers are checked, not trusted.** Field values reach your hooks already checked against your descriptions (defaults filled in, out-of-range values clamped, with a warning on the node). An effective recipe that isn't one (time not positive, amounts not finite) becomes an error on the node; a constraint with bad numbers is refused.
- **The solve stays linear.** Before the solve, a node's recipe may depend on anything about that node, but rates must scale in proportion to its machine count. Anything non-linear (power curves, pollution) belongs in `derive`, after the solve.
- **Installed packs run sandboxed**: in a worker of their own, without `fetch`, storage or the DOM, with a 10-second limit per call. Built-in packs run in the app's backend worker. Write the plugin so it doesn't notice the difference.
- **Hooks run on every solve,** often several times a second while someone drags a slider. Keep them quick: precompute tables at module level, not per call.

## Where it lives

`plugin/index.ts` exports the plugin as its default export, wrapped in `definePlugin`, which only adds type checking:

```ts
import { definePlugin } from "../../../src/contracts/plugin"; // the path `carbonara-pack new` wrote

export default definePlugin({ id: "brick-works" });
```

`carbonara-pack new` points the import at this repository wherever the pack folder is, so leave that line as it was written. The build bundles `plugin/index.ts` and everything it imports into one `plugin/index.js` in the `.cpack`, so you may split the plugin into modules and use the helpers in `src/contracts/`. A plugin written in plain JavaScript works too: put it at `plugin/index.js` and leave out the `.ts` file.

`pnpm carbonara-pack validate <folder>` type-checks `plugin/index.ts` with the repository's strict settings; building alone doesn't (esbuild only strips the types).

## The example

The whole plugin, then each hook in turn. Kilns get their temperature range from the pack data (`fields.temperature` on the building, see [[Guides/Pack authoring]]), so the plugin works for any building that has one.

```ts
// Brick Works mechanics: a kiln fired hotter works faster but burns more wood, a hot kiln needs a lining,
// a save can cap its kilns, and alternates follow the save profile.
import { definePlugin, isAlternate, unlockedRecipes, type FieldDescriptor } from "../../../src/contracts/plugin";

/** The temperature range a building's data gives (`fields.temperature`), if it has one. */
function temperatureRange(fields: Record<string, Record<string, unknown>> | undefined) {
  const range = fields?.temperature;
  return range ? { min: Number(range.min), max: Number(range.max), default: Number(range.default) } : undefined;
}

export default definePlugin({
  id: "brick-works",

  // A temperature slider in the inspector, for buildings whose data has a temperature range.
  nodeFields: (building) => {
    const range = temperatureRange(building.fields);
    const fields: Record<string, FieldDescriptor> = {};
    if (range) fields.temperature = { kind: "number", label: "Temperature", unit: "°C", step: 10, ...range };
    return fields;
  },

  // Settings for the whole factory, in the Save profile panel (stored in the document's settings.plugin).
  settingsFields: () => ({
    lining: { kind: "toggle", label: "Firebrick lining", default: false },
    kilnLimit: { kind: "number", label: "Kiln limit (0: none)", min: 0, max: 100, step: 1, default: 0 },
  }),

  // Alternates follow the save profile's unlocked list; without one, every alternate is unlocked.
  recipeAvailable: (recipe, { settings }) =>
    !isAlternate(recipe) || (unlockedRecipes(settings) ?? [recipe.id]).includes(recipe.id),

  // Warnings and errors on the node. An error leaves the node out of the solve.
  validate: ({ fields }, { settings }) =>
    Number(fields.temperature) > 1100 && settings.lining !== true
      ? [{ kind: "warning", message: "Above 1100 °C a kiln needs a firebrick lining" }]
      : [],

  // The recipe as this node runs it. The temperature is fixed per node, so any formula of it keeps the recipe
  // linear in the machine count: 1200 °C crafts 1.2× as fast and burns 1.44× the wood per craft.
  effectiveRecipe: ({ recipe, fields }) => {
    const heat = fields.temperature === undefined ? 1 : Number(fields.temperature) / 1000;
    const wood = recipe.in.wood;
    return {
      time: recipe.time / heat,
      in: wood === undefined ? recipe.in : { ...recipe.in, wood: wood * heat ** 2 },
      out: recipe.out,
    };
  },

  // A budget over the whole factory: the kilns' machine counts add up to at most the save's limit.
  constraints: (nodes, { settings }) => {
    const limit = Number(settings.kilnLimit ?? 0);
    const kilns = nodes.filter((node) => node.fields.temperature !== undefined);
    if (limit <= 0 || kilns.length === 0) return [];
    return [{ terms: kilns.map((node) => ({ node: node.id, coefficient: 1 })), op: "atMost", rhs: limit }];
  },

  // After the solve: metrics per node, which may be non-linear. The inspector names them with `metrics`.
  derive: ({ fields, machines }) => ({
    smoke: fields.temperature === undefined ? 0 : machines * (Number(fields.temperature) / 1000) ** 3,
  }),
  metrics: { smoke: { label: "Smoke", unit: "puffs/min" } },
});
```

With it, a Brickyard making 30 bricks a minute at 1200 °C needs 2.5 kilns instead of 3, burns 43.2 wood a minute instead of 30, and its kiln node warns about the lining until the save profile has one.

## The hooks

| Hook | Called | Returns |
| --- | --- | --- |
| `nodeFields(building, context)` | For the inspector and before every solve | The settings of nodes running in that building: `number` (a slider with a stepper), `choice` (a select), `toggle` (a switch) |
| `settingsFields(context)` | For the Save profile panel and before every solve | Settings for the whole document, stored in its `settings.plugin` |
| `recipeAvailable(recipe, context)` | Before every solve | Whether the recipe may be used. An unavailable one still solves, with a warning |
| `validate(node, context)` | Before every solve | Problems with a node's settings: `warning`s, or `error`s that leave the node out |
| `effectiveRecipe(node, context)` | Before every solve | The node's recipe with every modifier applied: `time` per craft and the amounts `in` and `out` |
| `constraints(nodes, context)` | Before every solve, once | Linear constraints over machine counts: `Σ coefficient · machines op rhs`, with `op` `atMost`, `equal` or `atLeast` |
| `derive(node, context)` | After every solve | Numbers per node, by key: power, pollution, anything. Non-linear is fine |
| `metrics` | For the inspector | A label and a unit for each key `derive` returns |
| `importer` | `carbonara-pack import` | Pack data and icons, generated from the game's own files |

`context` is `{ pack, settings }`: your pack's data and the document's plugin settings, with your settings fields checked and their defaults filled in. A node is `{ recipe, building, fields }`, its fields likewise checked; `constraints` gets every recipe node with its `id`, and `derive` gets the solved `machines` too.

### Node settings: `nodeFields`

Describe each setting once; the inspector draws it, checks typed values against it and makes every change one undo step. Descriptors are `{ kind: "number", label, min, max, step?, unit?, default }`, `{ kind: "choice", label, options, default }` or `{ kind: "toggle", label, default }`. Values are stored on the node (`fields`), so they travel with the document, its share links and its copies.

Return the fields per building, from the building's data where it varies (as the temperature range does here). A building without settings gets `{}`. Return a typed object (`Record<string, FieldDescriptor>`) rather than a conditional object literal: TypeScript widens `cond ? { … } : {}` into a type the plugin API doesn't accept.

### Save settings: `settingsFields` and `recipeAvailable`

With no node selected, the inspector shows the document's **save profile**: your settings fields, then the pack's alternate recipes (those tagged `alternate`) with a checklist. The list of unlocked alternates is shared by every pack (`settings.unlocked`); `unlockedRecipes(settings)` and `isAlternate(recipe)` read it, so `recipeAvailable` is usually the one line in the example. A document without a profile plans with every alternate unlocked.

### Problems: `validate`

Say what's wrong in words a player understands, with the numbers: "Above 1100 °C a kiln needs a firebrick lining", not "invalid temperature". Use a `warning` when the node still solves as it stands and an `error` only when it can't, since an error takes the node out of the solve.

### Modified recipes: `effectiveRecipe`

This is where most mechanics live: clock speeds, modules, beacons, fuels, productivity bonuses. Return the recipe per craft as one machine runs it; Carbonara multiplies by the machine count. Anything about the node may go into the formula, because it's fixed while the solver works.

The effective recipe may take and make other items than the recipe in your data: add a fuel that depends on a node setting, a burnt fuel cell, quality variants (`iron-plate@rare`). Every item it uses must be in your data's `items`; an unknown one is an error on the node. The canvas draws the node's ports from the items it uses (amounts above zero), in the order you return them, so a flow can be connected to an added fuel at once. An item the effective recipe stops using loses its port; a flow still attached to it keeps a port marked *not used*, and the node shows the problem until the flow is removed ([[CARB-95]]).

> [!NOTE]
> The canvas learns the effective items from the solve's results, so a new node shows your data's items for the moment its first solve takes, and a node whose settings change keeps its ports until the next solve has finished. Keep the recipe in your data close to how most nodes run it (Factorio's furnaces leave the fuel out, because it's the node's choice).

### Budgets: `constraints`

Constraints tie machine counts across the factory: a limited number of somersloops, of kilns, of power. Each is a list of `{ node, coefficient }` terms, a comparison and a right-hand side. They're hard: a factory that can't meet one doesn't solve and says so, so write budgets as `atMost` against counts that may be zero.

### After the solve: `derive` and `metrics`

`derive` gets each recipe node with its solved machine count and returns numbers by key; `metrics` gives each key a label and a unit. The inspector shows them under Metrics. One key is special: `power` (or `powerMW`), in MW, is what the totals card and the planner add up as the factory's power; without it they count the building's `power.consume` per machine.

### Importing game data: `importer`

When the game's data comes from its own files, give the plugin an importer instead of writing `data/` by hand:

```ts
importer: {
  accepts: ["bricks.json"],          // the file names `carbonara-pack import` passes in
  run: (files) => ({
    data: { items: [/* … */], recipes: [/* … */] },   // the sections, as in data/
    icons: { "icons/clay.webp": files["icons/clay.webp"] },  // the icons to keep, by path in the pack
  }),
},
```

`pnpm pack:import <folder> <file>… [--icons <folder>]…` passes the game files by name and every image found in the `--icons` folders as `icons/<name>.webp`, already turned into 64×64 WebP. It writes the sections into one YAML file each in `data/` and the icons you return into `icons/` (replacing both folders), then validates the pack. The importer runs in Node on the author's machine only, never in the app. The Satisfactory and Factorio importers ([[packs/satisfactory/plugin/importer.ts]], [[packs/factorio/plugin/importer.ts]]) show how to map a real game's files.

## Try it

1. `pnpm carbonara-pack validate <folder>`: the pack and the plugin's types.
2. In the app (see [[Guides/Pack authoring]], Try it in the app): select a kiln. The inspector shows *Temperature* with a slider; at 1200 °C the node's machine count drops and the wood flow grows. Deselect it, and the save profile shows *Firebrick lining*, *Kiln limit* and the alternate *Brick (Wet Mix)*. With the kiln selected, *Smoke* appears under Metrics.

## Test it

Hooks are plain functions, so test them by calling them. Tests for this repository's packs live in `tools/pack-cli/` (Vitest only runs tests below `src/` and `tools/`), as `satisfactory.mechanics.test.ts` and `factorio.mechanics.test.ts` do; they also solve reference factories with the real compiler and solver and compare the numbers with the game's.

```ts
import { describe, expect, it } from "vitest";
import { PackData } from "../../src/contracts/pack";
import plugin from "../../packs/brick-works/plugin/index";

const kiln = { id: "kiln", name: "Kiln", speed: 1, fields: { temperature: { min: 800, max: 1200, default: 1000 } } };
const brick = { id: "brick", buildings: ["kiln"], time: 6, in: { clay: 2, wood: 1 }, out: { brick: 1 } };
const context = { pack: PackData.parse({}), settings: {} };

describe("Brick Works kilns", () => {
  it("fire faster and burn more wood when hotter", () => {
    const node = { recipe: brick, building: kiln, fields: { temperature: 1200 } };
    expect(plugin.effectiveRecipe?.(node, context)).toEqual({ time: 5, in: { clay: 2, wood: 1.44 }, out: { brick: 1 } });
  });

  it("warn above 1100 °C without a lining", () => {
    const node = { recipe: brick, building: kiln, fields: { temperature: 1150 } };
    expect(plugin.validate?.(node, context)).toEqual([
      { kind: "warning", message: "Above 1100 °C a kiln needs a firebrick lining" },
    ]);
    expect(plugin.validate?.(node, { ...context, settings: { lining: true } })).toEqual([]);
  });
});
```

Run it with `pnpm test`. For a pack outside the repository, use any test runner the same way.

## Checklist

- [ ] Every setting is a field descriptor; nothing in the plugin draws UI or does I/O
- [ ] `effectiveRecipe` is linear in the machine count and keeps the data's items
- [ ] Problems read well to a player, with the numbers that matter
- [ ] `validate` finds no type errors; tests pin the numbers the game shows
