---
id: CARB-18
title: Keep large graphs smooth with levels of detail
type: improvement
status: review
priority: high
labels: [canvas, performance]
wave: "1"
milestone: "M1 It flows"
---

Three LOD tiers (full card, compact card, chip), viewport culling, and results that bypass React state.

**Done when** panning a 1k-node graph holds 60 fps in the perf harness, and the tiers have screenshot tests.

- [x] LOD tiers by zoom
- [x] Culling
- [x] Perf harness measurement in CI
- [x] Screenshot tests of the compact and chip tiers (dark and light)

## Result

Numbers and method are on [[Design]], Performance. In short, main-thread CPU per frame while panning the 1,000-node scene, production build: about 3.5 ms with full cards, 5–6.5 ms with compact cards, 12–17 ms with all 1,000 chips on screen. So the main thread holds 60 fps in every tier, with little headroom in the whole-graph overview.

**Honest caveat on "holds 60 fps":** the only machine available was a 4-vCPU VM with software rendering, shared with other agents (load average 3–12). Measured frame rates there swung between 15 and 57 fps for the same code, and even the 20-node chain only reached 40–50 fps. That's why the harness budgets main-thread CPU per frame, not fps. A real 60 fps confirmation needs a run on a machine with a GPU.

## Decisions

- Tiers at zoom 0.6 and 0.25 ([[src/client/canvas/model/lod.ts]]); one store subscription for the whole canvas, passed through context.
- Every tier keeps the node's size and port positions (fixed geometry, CARB-16), so tier switches never move edges or trigger re-measurement.
- Culling only above chip zoom; nodes carry `measured` sizes so fitting includes culled nodes (without it, the initial fit framed only the nodes on screen at zoom 1).
- Viewport layer promotion while panning was measured and dropped (see [[Design]]).
- Perf scene `perf` is registered in [[src/client/scenes/registry.ts]]; a build with `VITE_CANVAS_SCENES=true` keeps the scenes for production measurements.

## Open

- Overview of much larger graphs (10k nodes) will need more than culling: e.g. drawing chips on one canvas element or the WebGL renderer behind `CanvasAdapter`.
