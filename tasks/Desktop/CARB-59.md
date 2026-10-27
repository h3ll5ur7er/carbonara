---
id: CARB-59
title: Keep a 50k-node factory interactive
type: improvement
status: review
priority: high
labels: [performance]
wave: "3"
milestone: "M3 Megafactory"
---

Profiling pass across solver, transfer and rendering with the `bench/` factories; fix what the profile shows.

**Done when** all budgets in [[Architecture/Solver]] hold in CI.

- [x] Profile: solver, transfer and mapping back with `pnpm bench` ([[CARB-73]]); the canvas with a 50,000-node perf scene (`?scene=perf-50k`) in `e2e/canvas-perf.spec.ts` and Chrome CPU profiles of panning
- [x] Solver side: every budget holds with a wide margin ([[CARB-73]])
- [x] Canvas: React Flow gets only the window around the view of graphs above 2,000 nodes (full cards 15.1 → 5.6–6.7 ms a frame, compact cards 22.4 → 10–11 ms at 50,000 nodes; the 1,000-node scene is unchanged)
- [ ] Chips of a 50,000-node graph (160–220 ms a frame): [[CARB-100]]

**Profile** (27 Oct 2026, dev server in the Playwright image, main-thread CPU per frame while panning): at 50,000 nodes React Flow's own per-frame work dominated: its culling (`getNodesInside` over every node, `isEdgeVisible` over every edge) and its selection listener (every node and edge on every store update), not our components. Windowing the graph takes those down to the window's size. At chip zoom thousands of nodes are on screen, and their React components and store subscriptions are the cost: that needs a renderer that draws chips without a component each ([[CARB-100]]). Results already reach the canvas outside React state (per-slot subscriptions), and mapping back now keeps unchanged result objects, so a re-solve re-renders only what changed.
