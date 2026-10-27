---
id: CARB-100
title: Draw the chip tier of large graphs on one canvas
type: improvement
status: backlog
priority: medium
labels: [canvas, performance]
milestone: "M3 Megafactory"
---

Found in [[CARB-59]]. At chip zoom a 50,000-node graph puts thousands of nodes on screen (2,400 in the `perf-50k` scene at zoom 0.08), and each is a React Flow node: a React component with DOM elements and a store subscription. Panning there costs 160–220 ms of main-thread time a frame, culled or not ([[Design]], Performance). The card tiers are fine since windowing (5.6–6.7 and 10–11 ms).

Draw the chip tier of a windowed graph (more than 2,000 nodes) as one `<canvas>` layer under the viewport: chips as filled rectangles in their tints with the monogram, trouble rings, flows as lines. React Flow keeps only what is selected, dragged or hovered as real nodes, so selecting and dragging still work. This is the `CanvasAdapter` seam the roadmap's WebGL renderer would also use.

**Done when** panning the `perf-50k` scene at zoom 0.08 stays within the 25 ms chip budget of `e2e/canvas-perf.spec.ts`, and that case is in the spec.

- [ ] Profile which part of a frame the canvas layer takes at 50,000 nodes
- [ ] Canvas layer for chips and flows, redrawn on viewport and result changes
- [ ] Selection, hover and drag through real nodes
- [ ] Perf case and screenshots
