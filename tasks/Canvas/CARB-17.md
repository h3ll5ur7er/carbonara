---
id: CARB-17
title: Draw flows as living edges
type: feature
status: done
priority: high
labels: [canvas, ui]
wave: "1"
milestone: "M1 It flows"
---

Edges whose thickness follows throughput, coloured by saturation, with particles whose speed and density encode the rate ([[Design]]).

**Done when** the congested-graph scene shows healthy, near-capacity and overloaded edges distinctly, and reduced motion turns particles off.

- [x] Thickness ∝ log(rate)
- [x] Saturation colours + colour-blind palette
- [x] Particles with zoom and reduced-motion cut-offs
- [x] Screenshot tests

## Decisions

- The rules are pure functions in [[src/client/canvas/model/flow-style.ts]] with unit and property tests (monotonic width, log growth, bounds; saturation thresholds; particle speed and spacing). The numbers are on [[Design]], Flows as the hero visual.
- Each edge reads only its own result slot, so a re-solve re-renders only the flows that changed.
- Particles are a dash pattern on one extra path per edge, animated with `stroke-dashoffset` in CSS, instead of one element per particle: constant DOM cost per edge whatever the rate.
- The zoom cut-off is a single class on the canvas toggled when the zoom crosses 0.45, so zooming doesn't re-render edges; reduced motion is a CSS media query.
- Congested scene: [[src/client/canvas/scenes/congested.ts]] (`?scene=congested`), with an overflow diagnostic on the merged plate belt and a deficit on the gear goal.
- Tests: `e2e/canvas.spec.ts` checks the saturation of three edges, that busier flows are thicker, and that particles run at zoom 1 and are off when zoomed out or with reduced motion; screenshots in dark, light and the colour-blind palette.
