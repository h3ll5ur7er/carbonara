---
id: CARB-39
title: Collapse, enter and leave subgraphs
type: feature
status: in-progress
priority: high
labels: [canvas, subgraphs, ux]
wave: "3"
milestone: "M3 Megafactory"
---

`Ctrl+G` collapse with inferred ports, double-click to zoom in, breadcrumbs.

**Done when** the e2e test collapses a selection, enters it, edits it, and returns with parent results updated.

- [ ] Editing engine: collapse/expand commands
- [ ] Zoom transition + breadcrumbs
- [ ] e2e test
- [ ] Expand blueprints of sandboxed (third-party) packs: the plugin sandbox answers `blueprints: {}` for now, so their blueprint graphs show no results ([[src/shells/web/plugin-sandbox.ts]])
