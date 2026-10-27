---
id: CARB-6
title: Define the solver IR
type: feature
status: done
priority: urgent
labels: [contracts, solver]
wave: "0"
---

The IR from [[Architecture/Solver]], defined once in Rust (serde) with TS types generated from it, and a tested crossing of the WASM boundary.

**Done when** a TS-built IR crosses into WASM and is validated there (test), and the generated TS types are checked in CI to be up to date.

- [x] Rust types: Model, Node (process/junction), Edge, Constraint, Solution with slacks; `validate`
- [x] TS types generated with ts-rs; CI fails when they drift
- [x] Boundary via serde-wasm-bindgen, tested from TS in [[src/engines/solver/boundary.test.ts]]
- [x] Solution type: activities, flows, slacks per port, edge and pin

**Decisions** (recorded in [[Architecture/Solver]])

- The solver sees only *process* and *junction* nodes. Sources and sinks are processes with one ±1 rate, and rate pins become activity pins in the compiler. Recipes, sources and sinks are a compiler concern.
- No objective in the IR: the tiers are fixed by the solver, and each node carries its cost.
- `serde-wasm-bindgen` instead of postcard (KISS); revisit when a benchmark asks for it. It ignores unknown fields, so the TS types are what keep the shapes honest.
- No `Macro` type yet: a one-degree-of-freedom subgraph is a process node with its macro rates and a `max`. Multi-mode macros come with [[CARB-37]] (YAGNI).
