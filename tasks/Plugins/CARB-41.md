---
id: CARB-41
title: Run plugin hooks while compiling
type: feature
status: done
priority: urgent
labels: [plugins, engines]
wave: "2"
milestone: "M2 It's a game"
---

The hook pipeline in the `compiler` engine: `nodeFields`, `effectiveRecipe`, `constraints`, `recipeAvailable`, `derive`, `validate` ([[Architecture/Plugins]]).

**Done when** a test plugin exercising each hook changes the solve as expected.

- [x] Tests with a fixture plugin first ([[src/engines/compiler/hooks.fixture.ts]], [[src/engines/compiler/hooks.test.ts]], [[src/managers/analysis.plugins.test.ts]])
- [x] Each hook: `nodeFields` (defaults and checked values), `settingsFields`, `recipeAvailable`, `validate`, `effectiveRecipe`, `constraints`, `derive`
- [x] Derived metrics in results, named by the plugin's `metrics`
- [x] `packs.describePlugin` for clients; the live inspector shows a node's plugin fields, metrics and problems

Decisions:

- The hooks live in [[src/engines/compiler/hooks.ts]]; `compile.ts` calls `prepareRecipeNode` and `pluginConstraints` only.
- Plugin answers are checked like any input: field values that don't fit become the nearest allowed value or the default with a `warning`; invalid recipes or constraints are `error` diagnostics. `Diagnostic` gained the kind `warning`.
- Field values of undeclared fields pass through untouched.
- Locked recipes still solve, with a warning; pickers can filter by availability later.
- Where a plugin runs is a `PluginRuntime` (`compile`, `describe`); built-in packs get `localRuntime`. Third-party packs get the sandbox's ([[CARB-42]]).
