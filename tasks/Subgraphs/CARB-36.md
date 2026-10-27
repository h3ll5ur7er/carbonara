---
id: CARB-36
title: Compile one-degree-of-freedom subgraphs into macro recipes
type: feature
status: review
priority: high
labels: [solver, subgraphs]
wave: "2"
milestone: "M3 Megafactory"
---

Bottom-up compile from [[Architecture/Subgraphs]] for the 1-DOF case, with capacity, cached by hash.

**Done when** the scale-invariance and compiled-vs-inlined property tests pass.

- [x] Property tests first ([[crates/solver/tests/subgraphs.rs]]: compiled vs inlined, nested too; scale invariance)
- [x] Macro recipe + capacity
- [x] Shared cache across instances
- [x] Compiler: instances and ports into the IR, edges through ports, results back on the instance's ports ([[src/engines/compiler/instances.ts]])

**Decisions** (recorded in [[Architecture/Subgraphs]]):

- Summaries live in the Rust solver (`crates/solver/src/subgraphs/`); the compiler compiles every graph of a document into one IR model (IR version 2: `Model.blueprints`, `instance` nodes, `fromPort`/`toPort`, `Solution.instances`).
- A blueprint's pins are its design; an instance's activity is its scale `t` (pins × `t`). Inside, every port with an edge balances exactly; only loose ports (no edge can carry them) dump or miss, as the instance's surplus or deficit.
- `t_max` comes from node maxima and constraints that hold at zero. Belt limits inside don't reach the graph around; they show when the blueprint is expanded ([[CARB-38]]).
- The cache key is the blueprint's closure (its body plus the blueprints it places, renumbered); the pack and plugin settings reach the solver only through it, so they need no key of their own.
- Compiled vs inlined is claimed (and tested) as equal scores in every objective tier when the graph around can supply the instance. With shortages, both may explain them in different places at the same cost, as a flat graph does.
