---
id: CARB-39
title: Collapse, enter and leave subgraphs
type: feature
status: done
priority: high
labels: [canvas, subgraphs, ux]
wave: "3"
milestone: "M3 Megafactory"
---

`Ctrl+G` collapse with inferred ports, double-click to zoom in, breadcrumbs.

**Done when** the e2e test collapses a selection, enters it, edits it, and returns with parent results updated.

- [x] Editing engine: collapse/expand commands
- [x] Zoom transition + breadcrumbs
- [x] e2e test
- [x] Expand blueprints of sandboxed (third-party) packs: the plugin sandbox answers `blueprints: {}` for now, so their blueprint graphs show no results ([[src/shells/web/plugin-sandbox.ts]])
- [x] Instances and ports drawn on the canvas (they were placeholders), connected through ports
- [x] The canonical `subgraph` scene

## Decisions

- **Collapse and expand are editing commands** (`collapse`, `expand`, plus `renameBlueprint`), so they are one undo step each and reach MCP clients through `edit_graph`; no `create_subgraph` tool. The engine stays pure: the caller names the blueprint and the instance (the manager picks UUIDs when it doesn't). Rules on [[Architecture/Documents]] (Collapse and expand).
- **Expand is collapse's exact inverse**, property-tested on random documents and selections: nodes keep their ids and positions inside, the instance takes the selection's top-left corner, and expanding the last instance of a blueprint dissolves it. A port is shared by the flows of one item between one node outside and several inside (or the other way round) only when the shared half loses nothing, so the inverse is always exact.
- **Port inference** cuts each crossing flow at a port; a share (`ratio`) stays with its source's half; ports are named `in-<item>` / `out-<item>` and laid out beside the selection (the client passes the selection's `bounds`).
- **No per-instance results.** Inside a blueprint the canvas shows all its instances together and says so in the breadcrumbs: you edit every copy at once, so the combined load is what that view is about; with one instance (the usual case) it's exact. Each instance's own flows and scale are on its card. See [[Architecture/Subgraphs]].
- **Each level is a canvas of its own** (keyed by graph): opening zooms into the card, then the blueprint grows in; leaving comes back zoomed into the instance and glides out. `--duration-slow`, instant with reduced motion.
- **Shortcuts:** `Ctrl+G` / `Ctrl+Shift+G` as in drawing apps; `Ctrl+↓` / `Ctrl+↑` open and leave, as folders in a file browser. Ctrl+arrows no longer nudge.
- The inspector, totals, heatmap and Sankey describe the graph on screen (the document scoped to the blueprint). The inspector's instance section and the planner inside subgraphs are [[CARB-86]]; Find opening the way into subgraphs is [[CARB-85]].
