---
id: CARB-74
title: Set machine counts and target rates from the inspector
type: feature
status: done
priority: urgent
labels: [canvas, ux, documents]
wave: "1"
milestone: "M1 It flows"
---

A new factory has no pins, so the solver correctly produces nothing and every rate reads zero. To "see live rates" you have to be able to say "3 furnaces" or "60 plates per minute". Two pieces are missing: the canvas doesn't report the selection, and sources and sinks have no edit command for their rates (only recipe pins and plugin fields exist).

**Done when** selecting a recipe node shows it in the inspector with a machine-count control, a sink shows a target rate and a source a supply limit; changing them re-solves and the canvas shows the new rates (e2e from a new factory: quick-add, connect a source and a sink, set a target, read the rates).

- [x] `CanvasAdapter` reports selection changes (`onSelectionChange`); the live app keeps the selection
- [x] Inspector "Production" section: recipe machine count (pinned or "chosen by the solver"), sink target, source limit, in the document's rate unit ([[src/client/shell/inspector/inspect.ts]])
- [x] `setRate` editing command for source limits and sink targets (contract + engine, undoable, property-tested); the compiler already honoured them
- [ ] Plugin node fields in the inspector need the plugin, which runs in the backend — deferred to [[CARB-41]]
- [x] e2e "It flows" from an empty factory ([[e2e/live-canvas.spec.ts]])

**Also fixed on the way**

- Fitting a small factory zoomed to 200%, so a single new machine filled the screen. Fitting the whole graph now stops at 100%; zoom to selection still goes to 200%.
- Number fields take an explicit `nudge` for open-ended values (machines: 1 per arrow press; rates: the power of ten below the value), instead of a hundredth of an arbitrary maximum.

**Seen, not fixed here:** nodes added from the picker can land on top of each other when drops are close; auto-arrange ([[CARB-49]]) or a placement nudge should handle it.
