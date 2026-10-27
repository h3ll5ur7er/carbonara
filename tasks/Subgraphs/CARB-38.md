---
id: CARB-38
title: Solve a subgraph's inside when it's opened
type: feature
status: todo
priority: medium
labels: [solver, subgraphs]
wave: "2"
milestone: "M3 Megafactory"
---

Top-down expand with boundary flows fixed from the parent solution.

**Done when** opening an instance shows internal values consistent with the parent, solved lazily.

- [ ] Expand
- [ ] Lazy trigger from `analysis`
- [ ] Tests
