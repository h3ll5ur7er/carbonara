---
id: CARB-95
title: Draw ports for the items a plugin's effective recipe uses
type: improvement
status: review
priority: low
labels: [canvas, plugins]
---

The canvas draws a recipe node's ports from the recipe in the pack data ([[src/client/canvas/model/scene.ts]]), but the solver uses the plugin's `effectiveRecipe`. When a plugin adds an item (a fuel that depends on a node setting) there's no port to connect it to, and an item it drops leaves a port that carries nothing. Factorio's quality maps a node's items to variants (`iron-plate@rare`) the same way. Found while writing [[Guides/Plugin authoring]], which tells authors to keep every item in the data for now.

**Done when** a node's ports follow the items its effective recipe uses (from the analysis results, or a described recipe per node), and the plugin guide drops the caveat.

- [x] Decide where the canvas learns a node's effective items (results' `inputs`/`outputs` per node, or a `describeNode` call)
- [x] Ports for added items, none for dropped ones; existing flows to a vanished port shown as a problem
- [x] Update [[Guides/Plugin authoring]] and [[Architecture/Plugins]]
- [x] Planner proposals (ghost and layout shapes) and paste ghosts use the effective items too
- [x] e2e: a Factorio stone furnace gets a coal port and a coal source connects to it ([[e2e/plugins-ports.spec.ts]])

**Decision:** the results carry the items (`AnalysisResults.effectiveItems`, sparse: only recipe nodes whose effective recipe uses other items than the pack's, there even when nothing solves). The compiler computes them with the effective recipe and keeps them in the node's draft (`NodeInfo.items`), so an incremental compile recomputes them exactly when the node changes, and the sandbox returns them with its results. A `describeNode` call would cost a second round trip per edit running the same hooks; `NodeResult` inputs and outputs vanish when a solve fails and can't tell a zero rate from an unused item. Ports exist before the first solve (the pack recipe's), and the client keeps the last effective items until newer results arrive and reuses equal entries, so ports change once, after the solve, and never fall back in between. Details in [[Architecture/Plugins#Ports from effective recipes]].

A flow whose item the node no longer uses keeps a stray port marked "Not used"; the compiler's diagnostic ("carries …, which this node doesn't use") is the problem on the node. Before, such flows weren't drawn at all.

Not done: the port pickers ("Connect a producer/consumer") still choose recipes by the pack's items, so dragging from a coal source doesn't offer a stone furnace.
