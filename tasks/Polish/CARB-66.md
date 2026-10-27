---
id: CARB-66
title: Audit accessibility
type: improvement
status: in-progress
priority: medium
labels: [a11y]
wave: "3"
milestone: "M4 Ship"
---

Keyboard paths, focus, ARIA, contrast, reduced motion.

**Done when** an automated axe run is clean and keyboard e2e tests cover the core flows.

- [ ] axe in CI
- [ ] Keyboard e2e
- [ ] Reduced motion: every animation respects `prefers-reduced-motion`, with a test
- [ ] Screen readers: results, errors and tour steps announced without spam
- [ ] Keyboard map and guarantees in [[Design]] (Accessibility)
