---
id: CARB-80
title: Untangle the Sankey overview
type: feature
status: todo
priority: medium
labels: [planner, visual]
wave: "3"
milestone: "M3 Megafactory"
---

Follow-up of [[CARB-48]]. In the `sankey` scene, bands cross through each other's nodes, junction columns show as empty grey bars, and labels sit on top of bands. It should read at a glance.

- [ ] Order nodes within a column to minimise crossings (a few barycentre sweeps)
- [ ] Junctions draw as pass-throughs, not columns
- [ ] Labels beside their node, never over a band; values in the document's unit
