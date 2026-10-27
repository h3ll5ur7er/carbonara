---
id: CARB-73
title: Meet the solver's edit-to-results budgets
type: improvement
status: in-progress
priority: high
labels: [solver, performance]
wave: "3"
milestone: "M3 Megafactory"
---

Measured in [[CARB-12]] (median edit → results, release WASM): a 500-node component takes 155 ms against a 16 ms budget (since relaxed to 100 ms), a 10k-node flat graph 300 ms against 150 ms ([[Architecture/Solver]]). Most of the time is the LP: each objective tier is a fresh microlp solve; clarabel was no faster.

**Done when** the CI job "Performance budgets" passes (500 nodes < 100 ms, 10k < 150 ms) and is made blocking.

- [x] Profile compile vs. solve vs. transfer at 500 and 10k nodes (`pnpm bench` prints each phase and CPU time; `cargo run --release --example profile` profiles natively)
- [ ] Compile only changed components (compile is ~86 ms at 10k)
- [ ] Presolve: shrink the LP before solving (fixed nodes, chains, empty columns)
- [x] Warm start: drive microlp directly so tiers resume from the previous basis (one LP for all tiers)
- [ ] Warm start successive edits from a component's previous basis (microlp's public API can't load a basis)
- [ ] Make the bench job blocking

**Wave 2 scope:** the Rust-side items (presolve, warm start). Compiling only the changed component touches the compiler, which the Plugins work changes in parallel; it follows after both merge.

**Wave 2 result** (27 Oct 2026, medians; details and the run's conditions in [[Architecture/Solver]]):

| Scenario | Budget | Before | Now |
| --- | --- | --- | --- |
| 500-node component | 100 ms | 155 ms | **69 ms** (compile 5 / solve 63 / map 1) |
| 10k-node flat graph | 150 ms | 300 ms | 201 ms (compile 86 / solve 93 / map 23) |
| 50k-node factory from subgraphs ([[CARB-36]]) | 50 ms | — | 199 ms (compile 89 / solve 52 / map 55) |

What did it: all tiers in one warm microlp LP (2.4× natively on the 500-node LP; holds now keep zero slacks at zero and the rest by their total), lazy validation (18 ms → 0.3 ms at 10k), and JSON instead of JS objects at the WebAssembly boundary (33 → 18 ms in at 10k). Presolve wasn't needed for the 500-node budget and isn't done.

What remains for the other budgets is mostly outside the solver: compile and map-back are O(document) (per-component compile and map-back, after the compiler's plugin hooks settle), and the whole model crosses into WebAssembly on each edit (keep it in the `Solver`, send changed components only).
