---
id: CARB-73
title: Meet the solver's edit-to-results budgets
type: improvement
status: done
priority: high
labels: [solver, performance]
wave: "3"
milestone: "M3 Megafactory"
---

Measured in [[CARB-12]] (median edit → results, release WASM): a 500-node component takes 155 ms against a 16 ms budget (since relaxed to 100 ms), a 10k-node flat graph 300 ms against 150 ms ([[Architecture/Solver]]). Most of the time is the LP: each objective tier is a fresh microlp solve; clarabel was no faster.

**Done when** the CI job "Performance budgets" passes (500 nodes < 100 ms, 10k < 150 ms) and is made blocking.

- [x] Profile compile vs. solve vs. transfer at 500 and 10k nodes (`pnpm bench` prints each phase and CPU time; `cargo run --release --example profile` profiles natively)
- [x] Compile only what changed: by object, and by the edit's Immer patches (compile is ~86 ms at 10k)
- [x] Keep the model and solution in the WebAssembly `Solver`; send `ModelChanges`, get `SolutionChanges` back
- [x] Map back only what changed
- [ ] Presolve: shrink the LP before solving (fixed nodes, chains, empty columns) — not needed for a budget now; [[CARB-101]]
- [x] Warm start: drive microlp directly so tiers resume from the previous basis (one LP for all tiers)
- [x] Warm start successive edits from a component's previous LP (pins as parameter rows; see below)
- [x] Make the bench job blocking (verify on the first CI run after the merge)

**Wave 2 scope:** the Rust-side items (presolve, warm start). Compiling only the changed component touches the compiler, which the Plugins work changes in parallel; it follows after both merge.

**Wave 2 result** (27 Oct 2026, medians; details and the run's conditions in [[Architecture/Solver]]):

| Scenario | Budget | Before | Now |
| --- | --- | --- | --- |
| 500-node component | 100 ms | 155 ms | **69 ms** (compile 5 / solve 63 / map 1) |
| 10k-node flat graph | 150 ms | 300 ms | 201 ms (compile 86 / solve 93 / map 23) |
| 50k-node factory from subgraphs ([[CARB-36]]) | 50 ms | — | 199 ms (compile 89 / solve 52 / map 55) |

What did it: all tiers in one warm microlp LP (2.4× natively on the 500-node LP; holds now keep zero slacks at zero and the rest by their total), lazy validation (18 ms → 0.3 ms at 10k), and JSON instead of JS objects at the WebAssembly boundary (33 → 18 ms in at 10k). Presolve wasn't needed for the 500-node budget and isn't done.

What remains for the other budgets is mostly outside the solver: compile and map-back are O(document) (per-component compile and map-back, after the compiler's plugin hooks settle), and the whole model crosses into WebAssembly on each edit (keep it in the `Solver`, send changed components only).

**Wave 3 result** (27 Oct 2026, medians of `pnpm bench`, release WebAssembly, Node 22, load average about 2, CPU time matching wall time; details in [[Architecture/Solver]]):

| Scenario | Budget | Before (same machine, same day) | Now |
| --- | --- | --- | --- |
| 500-node component | 100 ms | 60 ms | **4 ms** (compile 0.3 / solve 3 / map 0.6) |
| 10k-node flat graph | 150 ms | 239 ms | **13 ms** (1.2 / 7 / 4) |
| 50k-node factory from subgraphs | 50 ms | 166 ms | **18–20 ms** (2 / 9 / 6–7) |
| 50k-node flat graph | — | 909 ms | 75 ms |
| Editing the blueprint | — | 809 ms | 175–200 ms |
| 500-node component, adding a sink (new) | — | — | 59–60 ms (the LP from scratch) |

What did it, in order: compiling only nodes and edges whose objects changed, and then only what the edit's patches touched (`PluginRuntime.compiler()`, one per document); sending only changes across the WebAssembly boundary both ways (IR version 3: `Changes`, `ModelChanges`, `SolutionChanges`); mapping back only what changed; and starting a pin edit from the component's last LP. microlp can't load a basis, but its solutions can be cloned and their variables fixed again: pins are parameter rows with two adjustment columns, solved free but dearer than any slack (so they stay at zero), then fixed; the next solve of the same shape clones that state and fixes the adjustments at the pins' differences. Results stay exact (property tests: warm against one LP per tier, compiled against inlined subgraphs, warm-started against fresh, incremental compile and mapping against fresh; the planner's tests pass unchanged). An edit that changes a component's shape still solves from scratch: [[CARB-101]].

CI ran the bench as fast as this machine before (500 nodes 53 ms, 10k 133 ms), so the job is now blocking.
