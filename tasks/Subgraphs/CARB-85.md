---
id: CARB-85
title: Find opens the way into subgraphs
type: improvement
status: todo
priority: medium
labels: [subgraphs, canvas, ux]
---

Find (`Ctrl+F`) lists nodes in every graph, but jumping to one in another graph (inside a subgraph, or in the factory while a subgraph is open) only works for the graph on screen. Since [[CARB-39]] subgraphs open on the canvas, so a jump can open the way there: the path of instances from the root to the node's blueprint (the first instance found when a blueprint is placed several times), then select and zoom to the node.

**Done when** jumping to a node inside a nested subgraph opens each level with the usual transition and selects the node, and an e2e test covers it.

- [ ] Path from the root to a blueprint ([[src/client/features/subgraphs/path.ts]])
- [ ] Jump across graphs in [[src/client/features/find/find-panel.tsx]]
- [ ] Tests
