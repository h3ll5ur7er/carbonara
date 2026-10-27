---
id: CARB-45
title: Plan production from goals
type: feature
status: review
priority: high
labels: [planner, engines]
wave: "2"
milestone: "M2 It's a game"
---

Optimize mode and the `planning` engine: build a superstructure IR from candidate recipes, solve, and turn the solution into a proposed subgraph.

**Done when** planning the template pack's goals yields minimal-cost graphs that solve without deficits.

- [x] Tests first
- [x] Superstructure
- [x] Proposal graph
- [x] `planning` manager with `planProduction` and `compareRecipes` (MCP `plan_production`, `compare_recipes`), wired into the web backend
- [x] Wiki: [[Architecture/Planning]]

Planning every item the template pack makes, accepting the proposal and solving the document gives no deficits and the planned raw use ([[src/managers/planning.test.ts]]).
