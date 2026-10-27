---
id: CARB-53
title: Edit many nodes and find things
type: feature
status: review
priority: medium
labels: [qol]
wave: "2"
milestone: "M3 Megafactory"
---

Multi-select editing; find across the factory including subgraphs; replace recipe everywhere.

**Done when** e2e tests cover each.

- [x] Multi-select editing: recipe and belt menus on the selection toolbar (`setRecipe`, `setLogistics` commands)
- [x] Find + jump: `Ctrl+F` bar over the canvas ([[src/client/features/find/find.ts]], unit tests)
- [x] Replace everywhere: from the find bar, one edit across all graphs
- [x] e2e: [[e2e/qol-find.spec.ts]]

Open: jumping into a subgraph waits for subgraph navigation ([[CARB-39]]); results there are listed but not jumpable. Clock and modules for many nodes wait for plugin fields in the inspector ([[CARB-41]]). Details on [[Design/Editor quality of life]] (Find and multi-select editing).
