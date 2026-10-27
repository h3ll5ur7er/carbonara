---
id: CARB-86
title: Inspector and planner inside subgraphs
type: improvement
status: todo
priority: medium
labels: [subgraphs, inspector, planner]
---

Two views still think in the root graph ([[CARB-39]]):

- The **inspector** shows a selected subgraph instance as "Blueprint · Nothing else to set". It should show the blueprint's name (renamable), how often it's placed, its scale and its ports' rates, with buttons to open and to expand it.
- The **planner** proposes and accepts into the root graph even while a subgraph is open (its proposal's commands name `root`). Inside a subgraph it should plan next to and into the blueprint on screen.

**Done when** both work inside a subgraph, with tests.

- [ ] Instance section in the inspector
- [ ] Planner accepts into the graph on screen
- [ ] Tests
