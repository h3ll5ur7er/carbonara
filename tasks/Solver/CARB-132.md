---
id: CARB-132
title: Place a shortage the same way after an edit as after a reload
type: feature
status: backlog
priority: low
labels: [solver]
wave: "3"
---

When a factory is short of something, the deficit tier can have several optimal answers (a consumer short of its input, or its supplier short of its own raw input), and the solver holds whichever one its LP found ([[CARB-131]]). A warm-started re-solve after a pin edit and a solve from scratch after a reload can therefore show the shortage at different ports, with different costs after it. Both are correct, but the diagnostics shouldn't move when nothing changed.

- [ ] Choose a canonical answer among the deficit tier's optima (for example the cheapest by the later tiers, through a lexicographic perturbation that keeps the deficit exact), without slowing the warm start below the budgets
- [ ] Property test: warm and cold solves agree on every tier
