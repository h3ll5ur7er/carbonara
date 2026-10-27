---
id: CARB-12
title: Expose the solver to the backend through WASM
type: feature
status: in-progress
priority: urgent
labels: [solver]
wave: "1"
milestone: "M1 It flows"
---

`crates/solver-wasm` bindings and the TS facade `src/engines/solver/`. Plus the benchmark generator and harness in `bench/`.

**Done when** the facade solves a TS-built IR in the backend worker, and the 500-node and 10k-node budgets from [[Architecture/Solver]] are measured in CI.

- [x] wasm-bindgen API (`solve`, incremental `Solver`), values as plain JS objects
- [x] TS facade (`solve`, `createSolver`) returning `Result<Solution, Unsolvable>`
- [ ] `bench/` generator for 1k / 10k / 50k-node factories
- [ ] Budgets enforced in CI

## Notes

- Values cross the boundary as plain JS objects (`serde-wasm-bindgen`), not postcard bytes or typed arrays: [[Architecture/Solver]] says a binary encoding is only worth it when the benchmarks say so. The bench measures the whole edit → results path including the crossing.
- Unsolvable models come back as `{ ok: false, error: "infeasible" | "unbounded" }`; inconsistent models and backend failures are bugs and throw.
- `createSolver()` wraps the incremental `Solver` (one per document); `dispose()` frees its cache.
