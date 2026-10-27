---
id: CARB-84
title: Editor quality-of-life loose ends
type: chore
status: in-progress
priority: low
labels: [canvas, ux]
wave: "3"
milestone: "M4 Ship"
---

Left over from [[CARB-49]] to [[CARB-56]].

- [x] Top-to-bottom arrange: flows leave and enter cards at the bottom and top, not sideways (per node: `flow: "down"` on its position)
- [x] Load ELK's worker before the first arrange (it took about 4 s on the dev server): warmed up 1.5 s after the documents are restored
- [ ] Find jumps into subgraphs once subgraph navigation exists ([[CARB-39]])
- [x] Multi-select editing of plugin fields (clock, modules): the inspector shows the fields all selected machines share
- [ ] Collapsible frames
- [ ] Bookmarks and custom shortcuts survive a restart (needs a preferences store)
- [x] Source and sink cards don't truncate long belt names (a rate in belts gets a line of its own)
- [x] Balance: the inspector's subtitle follows the "even" machine-count setting; alternatives offer only recipes whose main product is the item (not "Motor Recycling" for gears)
