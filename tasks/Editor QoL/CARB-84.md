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
- [x] Collapsible frames: fold to the label bar, held nodes hidden, their flows meet at the bar (`setCollapsed`)
- [ ] Bookmarks and custom shortcuts survive a restart (needs a preferences store)
- [x] Source and sink cards don't truncate long belt names (a rate in belts gets a line of its own)
- [x] Balance: the inspector's subtitle follows the "even" machine-count setting; alternatives offer only recipes whose main product is the item (not "Motor Recycling" for gears)

Still open (Wave 3, left on purpose): the find jump into other graphs is now [[CARB-85]], and bookmarks and custom shortcuts surviving a restart can build on the preferences store that has since landed. Known limits of what's done: straighten chain and the align commands still think in rows when flows run down; arranging lays out a collapsed frame's nodes as if it were open.
