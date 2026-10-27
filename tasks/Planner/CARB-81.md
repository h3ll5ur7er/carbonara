---
id: CARB-81
title: Smarter plans: buildings, resource weights and belts
type: feature
status: review
priority: medium
labels: [planner]
wave: "3"
milestone: "M3 Megafactory"
---

Follow-ups of [[CARB-45]].

- [x] Choose among a recipe's buildings (steel furnace, assembler 3) instead of always the default; a preference per building family in the plan options
- [x] Weigh raw resources per item, so Space Age plans don't all go through asteroids (per save profile: [[CARB-105]])
- [x] `recipeAvailable` gets the plugin settings with their defaults filled in, and is consulted for sandboxed packs too
- [x] Put belts or pipes on planned flows
- [x] Lay out proposals with the layout engine ([[CARB-49]]) instead of the stand-in layering

## Decisions

- **Buildings are a preference list**, `PlanOptions.buildings`: a recipe runs in the first preferred building it allows, else its default. That one list covers every family without naming families in the contract. The planner card derives the families (buildings recipes offer in place of one default building, merged when a default is itself an alternative: assembler 2 recipes join assembler 1's) and shows one select per family. The planner doesn't pick the fastest building by itself: what's buildable depends on the save.
- **Resource weights** (`PlanOptions.resourceWeights`) multiply a raw source's cost. To find a source's item, the compiled model now carries its item ids (`CompiledModel.items`, also from the sandbox). Storing them per save profile is [[CARB-105]].
- **Availability goes through the plugin runtime** (`PluginRuntime.unavailableRecipes(settings)`, `unavailable` in the sandbox protocol), computed with the compiler's `pluginContext`, so defaults are filled in and sandboxed packs are asked too. The superstructure takes the set instead of a plugin, so the planning engine no longer calls plugin code.
- **Layout:** the planning manager runs the layout engine's `arrange` on the proposal (shapes with ports from the planning engine's approximation of the canvas), then the engine places the block beside the factory. The stand-in layering (`src/engines/planning/layout.ts`) is gone.
- **Belts:** each flow gets the smallest belt or pipe of its item's form that carries it alone; wider flows get none.
- The MCP steel example now plans with `buildings: ["steel-furnace"]`: 480 steel furnaces.
