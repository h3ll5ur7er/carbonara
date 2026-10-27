---
id: CARB-11
title: Re-solve only what changed
type: feature
status: todo
priority: high
labels: [solver, performance]
wave: "1"
milestone: "M1 It flows"
---

Split the graph into weakly connected components and cache results by a hash of each component's IR, as in [[Architecture/Solver]].

**Done when** editing one component re-solves only that component (proven by a test counting solves) and results equal a full solve.

- [ ] Component decomposition with tests
- [ ] Content hash of a component's IR, cache with eviction
- [ ] Equivalence property test: incremental == full
