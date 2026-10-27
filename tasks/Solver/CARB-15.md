---
id: CARB-15
title: Solve automatically when a document changes
type: feature
status: todo
priority: urgent
labels: [managers]
wave: "1"
milestone: "M1 It flows"
---

The `analysis` manager: listens to `documentChanged`, compiles, solves, and publishes results to the client with a generation counter so stale results are dropped. Also totals and diagnostics.

**Done when** a use-case test with in-memory access shows edit → results event, stale results are dropped, and totals are correct for the template scenes.

- [ ] Use-case tests first
- [ ] Generation counter and cancellation
- [ ] Results event with typed arrays
- [ ] Totals and diagnostics
