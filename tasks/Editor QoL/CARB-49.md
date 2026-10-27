---
id: CARB-49
title: Auto-arrange graphs
type: feature
status: done
priority: high
labels: [qol, engines]
wave: "2"
milestone: "M2 It's a game"
---

The `layout` engine (ELK layered, in the worker): left → right or top → bottom, whole graph or selection, locked nodes respected, animated.

**Done when** arranging the canonical scenes produces no overlaps and fewer crossings than the input (tests), with screenshot tests.

- [x] Layout engine with tests ([[src/engines/layout/arrange.ts]]: unit tests on the canonical scenes, a property test over random graphs)
- [x] `editing.arrange` in the editing manager, ELK in a worker of its own started by the composition root
- [x] Frames move and fit around the nodes they hold (compound nodes in ELK)
- [x] Animated transitions (every move the canvas didn't make itself glides; instant with reduced motion)
- [x] Locked nodes (`setLocked` command, `Position.locked`, padlock badge, not draggable or nudgeable, `Shift+L`)
- [x] New nodes from the recipe picker or quick-add avoid landing on existing ones (seen in [[CARB-74]])
- [x] e2e and screenshots ([[e2e/qol-arrange.spec.ts]])

Decisions and open points are on [[Design/Editor quality of life]] (Auto-arrange and lock).

- "Fewer crossings than the input": the hand-made canonical scenes already cross little, so the tests compare against a scrambled start (fewer) and the hand-made layout (no more).
- Top → bottom places nodes well, but flows still leave and enter cards sideways (ports sit on the left and right), so they bend through neighbouring cards. Needs vertical port sides in the renderer to look right.
- The first arrange loads ELK's worker (1.5 MB); in the dev server that takes a few seconds.
