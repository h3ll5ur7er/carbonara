---
id: CARB-12
title: Expose the solver to the backend through WASM
type: feature
status: todo
priority: urgent
labels: [solver]
wave: "1"
milestone: "M1 It flows"
---

`crates/solver-wasm` bindings and the TS facade `src/engines/solver/`. Plus the benchmark generator and harness in `bench/`.

**Done when** the facade solves a TS-built IR in the backend worker, and the 500-node and 10k-node budgets from [[Architecture/Solver]] are measured in CI.

- [ ] wasm-bindgen API taking and returning postcard bytes
- [ ] TS facade with typed-array results
- [ ] `bench/` generator for 1k / 10k / 50k-node factories
- [ ] Budgets enforced in CI
