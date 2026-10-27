# Plugins

Every game pack has exactly one plugin (`plugin/index.js` in the `.cpack`), which works with that pack's data. A game without special mechanics uses the template's no-op plugin.

Plugins are how games differ without the core changing (open/closed principle). The `compiler` engine calls the hooks while it turns a document into the solver IR, so plugins never touch the solver or Rust.

[TOC]

## The API

The plugin contract is [[src/contracts/plugin.ts]]. Every hook is optional and pure: it gets the pack data and the document's plugin settings (`settings.plugin`, e.g. a save profile) and returns values; it never touches the document, storage or the DOM.

| Hook | When | Returns |
| --- | --- | --- |
| `nodeFields(building)` | Building the inspector, compiling | Field descriptors (`number`, `choice`, `toggle`) for nodes in that building, rendered without plugin UI code |
| `settingsFields()` | The Save profile panel, compiling | Field descriptors for document-wide settings (budgets), stored in `settings.plugin` |
| `metrics` (a property) | The inspector | Label and unit of each metric `derive` returns |
| `recipeAvailable(recipe)` | Compiling; recipe pickers and the planner later | Whether the recipe may be used (alternate unlocks, tech tree) |
| `validate(node)` | Compiling | Problems with a node's settings: warnings, or errors that leave the node out |
| `effectiveRecipe(node)` | Compiling, before the solve | The recipe as this node runs it, all modifiers applied. It must stay linear in the machine count |
| `constraints(nodes)` | Compiling, before the solve | Linear constraints over recipe nodes' machine counts (`Σ coefficient · machines op rhs`), e.g. a global budget |
| `derive(node)` | After the solve | Metrics such as power in MW; non-linear is fine here |
| `importer` | `carbonara-pack import` (maintainers) | Pack data and icons generated from the game's own files |

```ts
export default definePlugin({
  id: "satisfactory-core",
  nodeFields: (building) =>
    building.fields?.clock
      ? { clock: { kind: "number", label: "Clock", min: 1, max: 250, step: 0.0001, unit: "%", default: 100 } }
      : {},
  recipeAvailable: (recipe, { settings }) => !isAlternate(recipe) || (unlockedRecipes(settings) ?? []).includes(recipe.id),
  effectiveRecipe: ({ recipe, fields }) => ({ ...recipe, time: recipe.time / ((fields.clock as number) / 100) }),
  derive: ({ building, fields, machines }) => ({
    power: (building.power?.consume ?? 0) * ((fields.clock as number) / 100) ** 1.321929 * machines,
  }),
  metrics: { power: { label: "Power use", unit: "MW" } },
});
```

Hooks join the API when a pack needs them (YAGNI). UI contributions stay declarative: field descriptors and metric names.

### The hook pipeline

The `compiler` engine calls the hooks from one module, [[src/engines/compiler/hooks.ts]], so `compile.ts` only asks for a prepared node and the constraints. For a document it:

1. Builds the **plugin context**: the document's `settings.plugin` with the `settingsFields` checked and their defaults filled in.
2. For each recipe node: checks its **fields** against `nodeFields`. A missing value takes the default; a value of the wrong kind, out of range or not an option is replaced by the nearest allowed value or the default, with a `warning` diagnostic ("Clock speed 300 % is out of range; using 250 %"). Values of undeclared fields pass through. The hooks only ever see checked values.
3. `recipeAvailable` false → a warning ("Alternate: Pure Iron Ingot isn't unlocked"); the node still solves.
4. `validate` → the plugin's warnings and errors on the node; an error leaves the node out of the model.
5. `effectiveRecipe` → the node's rates. An answer that isn't a recipe (time not positive, amounts not finite) is an `error` diagnostic and the node is left out.
6. `constraints` over the compiled recipe nodes (in id order) → the IR's `constraints`. Terms on nodes that aren't compiled recipe nodes are dropped, constraints without terms too; a constraint with non-finite numbers or an unknown comparison is refused with an error diagnostic. Plugin constraints are hard: a solve that can't meet them is `infeasible` ([[Architecture/Solver]]), so budgets should be `atMost` against activities that may be zero.
7. After the solve, `toResults` calls `derive` per recipe node with its machine count; the metrics land in `NodeResult.derived`.

A plugin's answers are treated as input: checked, never trusted. Diagnostics carry the kind `warning` for things that don't change what's solved.

### Clients and plugins

Clients never run plugin code. `packs.describePlugin({ packId, settings })` ([[src/contracts/managers.ts]]) returns a `PluginDescription`: node fields by building id, the settings fields and the metrics, computed by `describePlugin` in the hooks module wherever the plugin runs. The inspector loads it per document ([[src/client/shell/inspector/plugin-description.ts]]) and reloads it when the document's plugin settings change.

Where a pack's plugin runs is a `PluginRuntime` ([[src/contracts/access.ts]]): `compile(document)` → the model plus a `results(outcome, version)` that maps the solution back, and `describe(settings)`. `runtimeOf(pack)` ([[src/engines/compiler/runtime.ts]]) gives built-in packs a local runtime around the same compiler functions; the analysis and packs managers only talk to runtimes.

## How mechanics map onto hooks

| Mechanic | How it's expressed |
| --- | --- |
| Satisfactory alternate recipes | `recipeAvailable` + a "Save profile" panel with the unlocked set |
| Overclocking, power shards | `nodeFields` + `effectiveRecipe` (rates) + `validate` (clock above the shard limit) + `derive` (power curve) |
| Somersloops | `effectiveRecipe` (output multiplier) + `constraints` (global budget) |
| Factorio modules and beacons | `nodeFields` (slots) + `effectiveRecipe` (speed, productivity, consumption) |
| Factorio heat (nuclear) | Heat becomes a flow item (MW) along heat-pipe edges; a custom `reactor` node kind applies the neighbour bonus from its layout field |
| Fluid temperatures | Item *variants* (`steam@500`), generated by the plugin |
| Factorio quality | Item variants per tier + recycler recipes with expected-value outputs (the LP handles the cycles) |

## The save profile

A document's `settings.plugin` is the **save profile**: what the player's save has. Two parts:

- **Unlocked alternates**, a convention shared by every pack: `settings.plugin.unlocked` lists the unlocked recipe ids among the recipes tagged `alternate`; without the list every alternate counts as unlocked (a new document plans with everything). `unlockedRecipes(settings)` and `isAlternate(recipe)` in [[src/contracts/plugin.ts]] read it, for plugins' `recipeAvailable` and for the client.
- The plugin's own **settings fields** (`settingsFields`), such as a budget.

With no node selected, the inspector shows the Save profile panel ([[src/client/features/save-profile/save-profile.tsx]]): the settings fields as controls and a filterable checklist of the pack's alternates with "Unlock all" and "Lock all". Each change is one `setPluginSettings` command ([[src/contracts/commands.ts]]), which merges keys into `settings.plugin` (null removes one), so it's one undo step.

## Satisfactory

The Satisfactory plugin's mechanics are in [[packs/satisfactory/plugin/mechanics.ts]], tested against reference factories with the game's numbers in [[tools/pack-cli/satisfactory.mechanics.test.ts]]. The formulas come from the game's own data file (Satisfactory 1.1 `CommunityResources/Docs/en-US.json`, see the pack's `CREDITS.md`):

| Mechanic | Rule (Docs field) | Hooks |
| --- | --- | --- |
| Clock speed | 1 % to 100 % (`mMinPotential` 0.01, `mMaxPotential` 1.0); craft time ÷ clock | `nodeFields` (`clock`, range from the building's `fields.clock`), `effectiveRecipe` |
| Power shards | Each adds 50 % to the clock limit (`mExtraPotential` 0.5), three at most: 150 %, 200 %, 250 %. A clock above the limit runs at the limit, with a warning ("Clock speed 180 % needs 2 power shards; running at 150 %") | `nodeFields` (`shards`), `validate`, `effectiveRecipe` |
| Somersloops | A building has `mProductionShardSlotSize` slots (Smelter and Constructor 1; Assembler, Foundry, Refinery, Converter 2; Manufacturer, Blender, Particle Accelerator, Quantum Encoder 4; none for the Packager, extractors and generators). Each filled slot adds 1 / slots to the outputs (`mProductionShardBoostMultiplier`): full doubles them, inputs stay | `nodeFields` (`somersloops`), `effectiveRecipe` |
| Somersloop budget | Save settings `limitSomersloops` (toggle) and `somersloops` (count): Σ somersloops per machine × machines ≤ count | `settingsFields`, `constraints` |
| Power use | `mPowerConsumption` × boost ^ 2 (`mProductionBoostPowerConsumptionExponent`) × clock ^ 1.321929 (`mPowerConsumptionExponent`, log2 2.5). A fractional machine count is built as whole machines plus one running at the leftover share of the clock, as in the game | `derive` → `power` (MW) |
| Power generated | Generators: `mPowerProduction` × clock, fuel burnt in proportion | `effectiveRecipe`, `derive` → `powerGenerated` (MW) |
| Alternates | The save profile's unlocked list | `recipeAvailable` |

Reference numbers the tests pin: a Constructor making Iron Plates takes 30 ingots/min for 20 plates at 4 MW; at 250 % with three shards 75 → 50/min at 13.43 MW; a Smelter at 50 % makes 15 ingots/min at 1.6 MW; 2.5 Constructors draw 9.6 MW (two at 100 %, one at 50 %); a full Assembler of Reinforced Iron Plates makes 10/min from 30 plates and 60 screws at 60 MW; one somersloop in a Manufacturer making Computers gives 3.125/min at 85.9375 MW; a Coal-Powered Generator burns 15 coal and 45 m³ water/min for 75 MW, at 250 % 37.5 coal for 187.5 MW.

Known simplifications:

- The Docs file lists the Smelter with 0 somersloop slots but a boost multiplier of 1; the game's Smelter takes one, so the plugin gives it one.
- Machines with recipe-dependent power (Particle Accelerator, Converter, Quantum Encoder) use the middle of their power range, as the importer writes it.
- The somersloop budget is linear in fractional machine counts (2.5 machines with one somersloop each count 2.5, though building them takes 3).
- Extractors have no recipes in the pack yet, so their clock speed has no effect.

## Isolation and trust

- **Built-in packs** are trusted. Their plugins run in the backend worker, alongside the compiler.
- **Third-party packs** run in a separate plugin worker with an opaque origin: no DOM, no access to our storage, only the plugin API over messages. The whole compile step for such a pack runs in that worker, so a solve costs one round trip, not one per hook call.
- UI contributions are declarative only; plugins never ship React components.
- Installing a third-party pack needs an explicit trust confirmation that shows its id, version and hash. Signed packs can come later.
