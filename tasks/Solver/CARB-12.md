---
id: CARB-12
title: Expose the solver to the backend through WASM
type: feature
status: done
priority: urgent
labels: [solver]
wave: "1"
milestone: "M1 It flows"
---

`crates/solver-wasm` bindings and the TS facade `src/engines/solver/`. Plus the benchmark generator and harness in `bench/`.

**Done when** the facade solves a TS-built IR in the backend worker, and the 500-node and 10k-node budgets from [[Architecture/Solver]] are measured in CI.

- [x] wasm-bindgen API (`solve`, incremental `Solver`), values as plain JS objects
- [x] TS facade (`solve`, `createSolver`) returning `Result<Solution, Unsolvable>`
- [x] `bench/` generator for 1k / 10k / 50k-node factories
- [ ] Budgets enforced in CI: measured in CI (`pnpm bench`, release WebAssembly), but **not met**, so the job doesn't block yet

## Notes

- Values cross the boundary as plain JS objects (`serde-wasm-bindgen`), not postcard bytes or typed arrays: [[Architecture/Solver]] says a binary encoding is only worth it when the benchmarks say so. The bench measures the whole edit → results path including the crossing.
- Unsolvable models come back as `{ ok: false, error: "infeasible" | "unbounded" }`; inconsistent models and backend failures are bugs and throw.
- `createSolver()` wraps the incremental `Solver` (one per document); `dispose()` frees its cache.
- **Budgets not met** (median edit → results, release WebAssembly, Node 22): 500-node component 155 ms (budget 16 ms), 10k-node flat graph of 20 components 300 ms (budget 150 ms), flat 50k-node graph 1.15 s (its budget assumes subgraphs, Wave 2). The LP solve dominates: each tier is a cold microlp simplex (~30–40 ms natively for a 500-node component, ~2× in WebAssembly); clarabel measured the same. Details and ideas in [[Architecture/Solver]] (Performance). The CI job `Performance budgets` runs the bench and fails without blocking (`continue-on-error`) until the budgets are met. The task stays in review until someone decides whether to take on the solver performance work or relax the budgets.
- Measured improvements so far: settling pins, deficits and overflow in one LP when they can all be zero (exact; 5 → 3 LPs for a plan without shortages, 280 → 160 ms for 500 nodes), and indexing edges per node in `toResults` (it was quadratic: 15 s → 1.15 s at 50k nodes).

**Closed by the integrator:** the budgets are measured in CI (job "Performance budgets", non-blocking) but not met (500 nodes: 155 ms vs 16 ms; 10k: 300 ms vs 150 ms). Meeting them is [[CARB-73]].
