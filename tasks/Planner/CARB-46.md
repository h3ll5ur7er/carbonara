---
id: CARB-46
title: Show proposals as ghosts to accept, adjust or discard
type: feature
status: done
priority: high
labels: [planner, ux]
wave: "2"
milestone: "M2 It's a game"
---

Goal planner UI and the proposal ghost with a summary card (machines, raw inputs, power).

**Done when** the e2e test plans a goal, accepts it, and finds it auto-arranged and undoable in one step.

- [x] Goal picker
- [x] Ghost + summary card
- [x] Accept / adjust / discard
- [x] e2e
- [x] Reusable ghost renderer in `src/client/canvas/ghost/` (fixed or pointer-following placement) for [[CARB-51]]
- [x] Scene `planner` with screenshots, wiki ([[Design]], Goal planner and Ghosts)

The pointer-following placement has no caller yet; [[CARB-51]] (paste) is its first, and should cover it with its e2e test.
