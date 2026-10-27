---
id: CARB-90
title: Blueprints travel with a copy
type: improvement
status: todo
priority: low
labels: [qol, subgraphs]
wave: "3"
milestone: "M4 Ship"
---

Left over from [[CARB-51]]. A copy of subgraph instances holds only the instances, not their blueprints, so pasting them into a factory that lacks the blueprint leaves them out ("1 subgraph this factory doesn't have"). Carry the blueprints the copied instances use (transitively) in the `Clipboard` payload ([[src/contracts/clipboard.ts]]) and add them on paste, which needs an editing command that adds a blueprint (coordinate with [[CARB-39]]). Decide what happens when the target has a different blueprint under the same id (rename, or reuse when identical).

**Done when** copying an instance from one factory and pasting it into another adds the instance with its blueprint, as one undo step, and the paste property tests cover it.

- [ ] Payload carries the blueprints
- [ ] Paste adds missing blueprints (same id taken: fresh id)
- [ ] Property and e2e tests
