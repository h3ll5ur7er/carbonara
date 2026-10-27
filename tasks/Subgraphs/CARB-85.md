---
id: CARB-85
title: Find opens the way into subgraphs
type: improvement
status: review
priority: medium
labels: [subgraphs, canvas, ux]
---

Find (`Ctrl+F`) lists nodes in every graph, but jumping to one in another graph (inside a subgraph, or in the factory while a subgraph is open) only works for the graph on screen. Since [[CARB-39]] subgraphs open on the canvas, so a jump can open the way there: the path of instances from the root to the node's blueprint (the first instance found when a blueprint is placed several times), then select and zoom to the node.

**Done when** jumping to a node inside a nested subgraph opens each level with the usual transition and selects the node, and an e2e test covers it.

- [x] Path from the root to a blueprint ([[src/client/features/subgraphs/path.ts]])
- [x] Jump across graphs in [[src/client/features/find/find-panel.tsx]]
- [x] Tests (`pathTo` unit tests; e2e in [[e2e/subgraphs.spec.ts]]: into a nested subgraph and back out)

## Decisions

- **"First instance found"** is breadth first: the fewest levels, then the first instance by id in each graph. When the subgraph on screen already is the node's blueprint (opened through another instance), the jump stays.
- **Level by level:** the canvas of each level announces its first settled view (`canvasShown`), and the next dive waits for it (`nextCanvasShown`), so each level zooms into its instance and grows in as when opened by hand. Going the other way, the jump first leaves up to where the way parts from the levels open now.
- **The query survives the levels:** each graph is a canvas of its own with a find bar of its own, so the query and the highlighted result moved into the find store. Closing the bar clears them, as before.
