---
id: CARB-80
title: Untangle the Sankey overview
type: feature
status: done
priority: medium
labels: [planner, visual]
wave: "3"
milestone: "M3 Megafactory"
---

Follow-up of [[CARB-48]]. In the `sankey` scene, bands cross through each other's nodes, junction columns show as empty grey bars, and labels sit on top of bands. It should read at a glance.

- [x] Order nodes within a column to minimise crossings (a few barycentre sweeps)
- [x] Junctions draw as pass-throughs, not columns
- [x] Labels beside their node, never over a band; values in the document's unit
- [x] Bands that skip columns route around the nodes in between

## Decisions

- **Junctions pass through:** each junction's inflows are matched to its outflows in canvas order (as the planner dissolves hubs), giving bands from where items come from to where they go. A band through an overloaded belt keeps the worst warning of the edges it follows. Junctions with nothing in or nothing out stay as bars.
- **Bands that skip columns take a slot** in every column they pass (a classic Sankey "dummy node"), stacked and ordered with the nodes, so they never run through a bar.
- **Order:** canvas order first, then barycentre sweeps down and up; the order with the fewest rate-weighted crossings wins. Then a few relaxation passes level slots with their neighbours, and the chart is centred.
- **Labels** are placed after the bands (checked against bands, bars and each other up to 400 nodes; beyond that they take their first place): an output's right of its bar; any other above its bar running right or left, else below, whichever covers the least band, bar or earlier label. Each column keeps room above every bar for one.
