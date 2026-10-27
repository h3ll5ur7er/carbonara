---
id: CARB-66
title: Audit accessibility
type: improvement
status: review
priority: medium
labels: [a11y]
wave: "3"
milestone: "M4 Ship"
---

Keyboard paths, focus, ARIA, contrast, reduced motion.

**Done when** an automated axe run is clean and keyboard e2e tests cover the core flows.

- [x] axe in CI ([[e2e/a11y-axe.spec.ts]]: every canonical scene in both themes, and the live app's main states)
- [x] Keyboard e2e ([[e2e/a11y-keyboard.spec.ts]]: create, quick-add, connect ports, target, plan and accept, paste with the ghost, collapse, enter and leave a subgraph, undo, close a tab)
- [x] Reduced motion: every animation respects `prefers-reduced-motion`, with a test ([[e2e/a11y-motion.spec.ts]])
- [x] Screen readers: results, errors and tour steps announced without spam
- [x] Keyboard map and guarantees in [[Design]] (Accessibility)

Fixed: text contrast (`fg-subtle`, `fg-faint`), soft-only focus rings, the factory tab list's close buttons, the planner's panel-less tabs, ports as unnamed divs (now buttons that connect with Enter), node names, the tour card's landmarks, the totals' alert that spoke on every solve, and the focus dropping to the page after quick-add, the recipe picker, the planner, a subgraph and Escape in the planner's item field.

One axe exception, scoped to one rule and one element: target size for the canvas's ports (drawn in flow units, so their size is the zoom).

Follow-up: [[CARB-120]] (getting around a large factory by keyboard).
