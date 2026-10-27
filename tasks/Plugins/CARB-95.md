---
id: CARB-95
title: Draw ports for the items a plugin's effective recipe uses
type: improvement
status: todo
priority: low
labels: [canvas, plugins]
---

The canvas draws a recipe node's ports from the recipe in the pack data ([[src/client/canvas/model/scene.ts]]), but the solver uses the plugin's `effectiveRecipe`. When a plugin adds an item (a fuel that depends on a node setting) there's no port to connect it to, and an item it drops leaves a port that carries nothing. Factorio's quality maps a node's items to variants (`iron-plate@rare`) the same way. Found while writing [[Guides/Plugin authoring]], which tells authors to keep every item in the data for now.

**Done when** a node's ports follow the items its effective recipe uses (from the analysis results, or a described recipe per node), and the plugin guide drops the caveat.

- [ ] Decide where the canvas learns a node's effective items (results' `inputs`/`outputs` per node, or a `describeNode` call)
- [ ] Ports for added items, none for dropped ones; existing flows to a vanished port shown as a problem
- [ ] Update [[Guides/Plugin authoring]] and [[Architecture/Plugins]]
