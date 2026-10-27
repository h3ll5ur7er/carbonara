---
id: CARB-47
title: Show factory totals
type: feature
status: review
priority: medium
labels: [planner, ui]
wave: "2"
milestone: "M3 Megafactory"
---

Totals dashboard: raw resources against map limits, power, building counts, build cost.

**Done when** totals match the analysis results for the canonical scenes (screenshot + unit tests).

- [x] Dashboard
- [x] Tests

The canonical canvas scenes carry hand-built results without totals, so the checks run on a `totals` scene whose document and results come from the real engines ([[src/client/features/totals/summary.test.ts]], `e2e/planner-totals.spec.ts`). Build cost waits for packs to describe what buildings cost.
