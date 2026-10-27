---
id: CARB-74
title: Set machine counts and target rates from the inspector
type: feature
status: todo
priority: urgent
labels: [canvas, ux, documents]
wave: "1"
milestone: "M1 It flows"
---

A new factory has no pins, so the solver correctly produces nothing and every rate reads zero. To "see live rates" you have to be able to say "3 furnaces" or "60 plates per minute". Two pieces are missing: the canvas doesn't report the selection, and sources and sinks have no edit command for their rates (only recipe pins and plugin fields exist).

**Done when** selecting a recipe node shows it in the inspector with a machine-count control, a sink shows a target rate and a source a supply limit; changing them re-solves and the canvas shows the new rates (e2e from a new factory: quick-add, connect a source and a sink, set a target, read the rates).

- [ ] `CanvasAdapter` reports selection changes; the live app keeps the selection
- [ ] Inspector "Production" section: recipe machine count (pin or automatic), sink target, source limit, in the document's rate unit
- [ ] Editing command for source/sink rates (contract + engine, undoable); compiler honours them
- [ ] Plugin node fields in the inspector need the plugin, which runs in the backend: a `packs`/`analysis` method for a node's field descriptors (or defer to [[CARB-41]])
- [ ] e2e: "It flows" from an empty factory
