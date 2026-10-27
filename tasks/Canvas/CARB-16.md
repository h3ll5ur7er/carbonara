---
id: CARB-16
title: Render factory nodes behind a CanvasAdapter
type: feature
status: todo
priority: urgent
labels: [canvas, ui]
wave: "1"
milestone: "M1 It flows"
---

`CanvasAdapter` interface and its React Flow implementation, with recipe, source, sink and splitter node components and their ports ([[Design]]).

**Done when** the canonical 20-node chain renders from a document read model and its screenshots are approved.

- [ ] `CanvasAdapter` interface (the only seam for a future WebGL renderer)
- [ ] Node components with item-icon ports and live rates
- [ ] Node components subscribe to their own result slot
- [ ] Screenshot tests
