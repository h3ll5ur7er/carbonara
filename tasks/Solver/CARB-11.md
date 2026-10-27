---
id: CARB-11
title: Re-solve only what changed
type: feature
status: done
priority: high
labels: [solver, performance]
wave: "1"
milestone: "M1 It flows"
---

Split the graph into weakly connected components and cache results by a hash of each component's IR, as in [[Architecture/Solver]].

**Done when** editing one component re-solves only that component (proven by a test counting solves) and results equal a full solve.

- [x] Component decomposition with tests
- [x] Content hash of a component's IR, cache with eviction
- [x] Equivalence property test: incremental == full

## Notes

- Tests: [[crates/solver/tests/incremental.rs]]. "Editing one component re-solves only that component" counts solves with `Solver::last_solved` / `last_reused`. Properties: incremental == fresh solve (exactly equal), component-wise == one big LP (every tier's optimum within 1e-6), every node and edge in exactly one component.
- Plugin constraints join the components of the nodes they mention; `validate` now rejects constraints without terms (they belong to no component).
- Eviction: the cache keeps only the components the last solve used, so one `Solver` per document (the analysis manager's job, [[CARB-15]]).
- An unsolvable component fails the whole solve. Fine while only plugin constraints can cause it; revisit when packs add them ([[CARB-43]], [[CARB-44]]).
