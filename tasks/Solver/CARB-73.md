---
id: CARB-73
title: Meet the solver's edit-to-results budgets
type: improvement
status: todo
priority: high
labels: [solver, performance]
wave: "2"
milestone: "M3 Megafactory"
---

Measured in [[CARB-12]] (median edit → results, release WASM): a 500-node component takes 155 ms against a 16 ms budget (since relaxed to 100 ms), a 10k-node flat graph 300 ms against 150 ms ([[Architecture/Solver]]). Most of the time is the LP: each objective tier is a fresh microlp solve; clarabel was no faster.

**Done when** the CI job "Performance budgets" passes (500 nodes < 100 ms, 10k < 150 ms) and is made blocking.

- [ ] Profile compile vs. solve vs. transfer at 500 and 10k nodes
- [ ] Compile only changed components (compile is ~60 ms at 10k)
- [ ] Presolve: shrink the LP before solving (fixed nodes, chains, empty columns)
- [ ] Warm start: drive microlp directly so tiers and successive edits resume from the previous basis
- [ ] Make the bench job blocking

**Wave 2 scope:** the Rust-side items (presolve, warm start). Compiling only the changed component touches the compiler, which the Plugins work changes in parallel; it follows after both merge.
