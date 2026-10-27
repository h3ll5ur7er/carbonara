---
id: CARB-38
title: Solve a subgraph's inside when it's opened
type: feature
status: done
priority: medium
labels: [solver, subgraphs]
wave: "2"
milestone: "M3 Megafactory"
---

Top-down expand with boundary flows fixed from the parent solution.

**Done when** opening an instance shows internal values consistent with the parent, solved lazily.

- [x] Expand (`Solver::expand`: the body with its ports pinned to the instances' flows, pins times their scale)
- [x] Lazy trigger from `analysis` (`getResults({ graph: <blueprint id> })` solves once per version; `watchResults` / `unwatchResults` publish it with every solve while watched)
- [x] Tests (Rust: expansion agrees with the graph around, as a property; manager use cases)

**Decisions:** a blueprint graph's results are the inside of all its instances together (with one instance, exactly that one); a blueprint without instances is solved as designed. Watches count per document and graph. Per-instance results wait for the UX that needs them ([[CARB-39]]).
