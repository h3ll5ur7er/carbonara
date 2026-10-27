---
id: CARB-14
title: Compile documents into solver IR
type: feature
status: done
priority: urgent
labels: [engines]
wave: "1"
milestone: "M1 It flows"
---

The `compiler` engine: document + pack → IR, and solution → per-node and per-edge results. Plugin hooks are called here, but in this wave only through identity defaults (the hook pipeline is [[Architecture/Plugins]] work).

**Done when** compiling the template scenes is deterministic (same input → byte-identical IR) and results map back to the right nodes and ports.

- [x] Tests first: determinism, mapping back, unknown ids reported
- [x] Nodes, edges, pins, logistics capacities from pack data
- [x] Hook call sites with identity defaults

## Notes

- [[src/engines/compiler/compile.ts]] (`compile`) and [[src/engines/compiler/results.ts]] (`toResults`); the mapping is in [[Architecture/Solver]].
- Tests: the template's water loop compiled to an exact model, building speed, pins, unit conversion, `nodeFields` + `effectiveRecipe` + `derive` call sites, every kind of unknown id; fast-check properties for byte-identical IR (also under reordered maps) and indices always in range. Mapping back is tested with a hand-written solution (engines can't call the solver engine; the full path is tested in the analysis manager, [[CARB-15]]).
- Costs: sources 1 per item/s, everything else 0. Machine-count or power costs can come when a pack or the planner needs them.
- Blueprint instances report an `error` diagnostic until subgraphs land (Wave 2).
- `recipeAvailable` isn't called by the compiler: it's for pickers and the planner.
