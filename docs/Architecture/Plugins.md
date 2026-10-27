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
| Overclocking, power shards | `effectiveRecipe` (rates) + `derive` (power curve) + `constraints` (shard budget) |
| Somersloops | `effectiveRecipe` (output multiplier) + `constraints` (global budget) |
| Factorio modules and beacons | `nodeFields` (slots) + `effectiveRecipe` (speed, productivity, consumption) |
| Factorio heat (nuclear) | Heat becomes a flow item (MW) along heat-pipe edges; a custom `reactor` node kind applies the neighbour bonus from its layout field |
| Fluid temperatures | Item *variants* (`steam@500`), generated by the plugin |
| Factorio quality | Item variants per tier + recycler recipes with expected-value outputs (the LP handles the cycles) |

## Isolation and trust

- **Built-in packs** are trusted. Their plugins run in the backend worker, alongside the compiler.
- **Third-party packs** run in a separate plugin worker with an opaque origin: no DOM, no access to our storage, only the plugin API over messages. The whole compile step for such a pack runs in that worker, so a solve costs one round trip, not one per hook call.
- UI contributions are declarative only; plugins never ship React components.
- Installing a third-party pack needs an explicit trust confirmation that shows its id, version and hash. Signed packs can come later.
