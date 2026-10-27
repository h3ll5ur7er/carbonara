---
id: CARB-20
title: Select, snap, align to guides and navigate
type: feature
status: done
priority: medium
labels: [canvas, ux]
wave: "1"
milestone: "M1 It flows"
---

Box and lasso selection, snap to grid, smart alignment guides, arrow-key nudge, zoom to fit / selection ([[Design/Editor quality of life]]).

**Done when** each behaviour has a component or e2e test.

- [x] Box + lasso selection
- [x] Snap to grid (Alt bypass)
- [x] Alignment guides with spacing indicators
- [x] Nudge
- [x] Zoom to fit / selection

## Decisions

- Gestures follow design tools: a drag on empty canvas selects, panning is scroll, middle/right drag or Space-drag ([[Design/Editor quality of life]] has the table). The perf harness pans with the middle button, so it is unaffected.
- The rules are pure and tested: [[src/client/canvas/model/snap.ts]] (alignment, even spacing, grid; a property test bounds every snap), [[src/client/canvas/model/selection.ts]] (lasso hit test, nudge steps).
- Snapping intercepts React Flow's drag position changes; the node under the pointer leads and the others follow by the same offset. React Flow reports unsnapped positions on drop, so the canvas applies the last snap offset to the drop and to the `moveNodes` it sends.
- Zoom to fit and to the selection are app commands ([[src/client/canvas/commands.ts]], added to [[src/client/shell/app-commands.ts]]): one registration gives the shortcuts `F` / `Shift+F` and the palette entries. The canvas on screen provides the actions through [[src/client/canvas/viewport.ts]].
- Arrow keys are captured before React Flow's own nudging (5 px, not on the grid) and send one `moveNodes` per press.
- React Flow's delete key is off: deleting only from local state would make nodes vanish from the view but not the document.
- Tests: `e2e/canvas-editing.spec.ts` (box, lasso, snap with guides and Alt bypass, nudge, F / Shift+F, palette entries, spacing marks screenshot).
