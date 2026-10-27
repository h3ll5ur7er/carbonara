---
id: CARB-120
title: Move through the canvas and panels quickly by keyboard
type: improvement
status: backlog
priority: low
labels: [a11y]
wave: "3"
milestone: "M4 Ship"
---

Found in [[CARB-66]]. Every core flow works with the keyboard alone ([[Design]], Accessibility), but the way through a large factory is long: Tab reaches every flow before the first node (React Flow draws the flows first), then every node and its ports, and the inspector only after the whole graph.

**Done when** a keyboard user gets from the canvas to the inspector and back, and from a node to its neighbours, in a few keys on a 1,000-node factory, with a test in [[e2e/a11y-keyboard.spec.ts]].

- [ ] A key that cycles the focus between the top bar, the canvas, the library and the inspector (F6 is the usual one; browsers keep it in some places, so check)
- [ ] Arrow keys between connected nodes, or the flows after the nodes in the tab order
- [ ] The factory tabs move with the arrow keys (one tab stop), as a tab list does
