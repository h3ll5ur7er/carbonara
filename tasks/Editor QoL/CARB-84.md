---
id: CARB-84
title: Editor quality-of-life loose ends
type: chore
status: todo
priority: low
labels: [canvas, ux]
wave: "3"
milestone: "M4 Ship"
---

Left over from [[CARB-49]] to [[CARB-56]].

- [ ] Top-to-bottom arrange: flows leave and enter cards at the bottom and top, not sideways
- [ ] Load ELK's worker before the first arrange (it took about 4 s on the dev server)
- [ ] Find jumps into subgraphs once subgraph navigation exists ([[CARB-39]])
- [ ] Multi-select editing of plugin fields (clock, modules)
- [ ] Collapsible frames
- [ ] Bookmarks and custom shortcuts survive a restart (needs a preferences store)
- [ ] Source and sink cards don't truncate long belt names
- [ ] Balance: the inspector's subtitle follows the "even" machine-count setting; alternatives offer only recipes whose main product is the item (not "Motor Recycling" for gears)
