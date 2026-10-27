---
id: CARB-86
title: Inspector and planner inside subgraphs
type: improvement
status: in-progress
priority: medium
labels: [subgraphs, inspector, planner]
---

Two views still think in the root graph ([[CARB-39]]):

- The **inspector** shows a selected subgraph instance as "Blueprint · Nothing else to set". It should show the blueprint's name (renamable), how often it's placed, its scale and its ports' rates, with buttons to open and to expand it.
- The **planner** proposes and accepts into the root graph even while a subgraph is open (its proposal's commands name `root`). Inside a subgraph it should plan next to and into the blueprint on screen.

**Done when** both work inside a subgraph, with tests.

- [x] Instance section in the inspector
- [x] Planner accepts into the graph on screen
- [x] Tests (inspect and panel component tests, the planning manager inside a blueprint)
- [ ] E2e: the inspector on an instance, a plan accepted inside a subgraph

## Decisions

- **Ports' rates by item**, as the instance's card shows them (`NodeResult.inputs` / `outputs`): two ports of one item in one direction show the same total. Per-port flows would need the edges, and the card would disagree.
- **"Select all N"** selects the copies in the graph on screen; copies in other graphs can't be selected from here. The count in the subtitle ("placed 3 times") counts every graph.
- **The planner's graph is an argument**, `planning.planProduction({ graph })` (default `root`, also on the `plan_production` MCP tool). A `Proposal` gains no field: its commands name the graph, and the client reads it from them (`proposalGraph`). The ghost shows only on that graph; the card (and *Accept*) stays wherever the person goes.
