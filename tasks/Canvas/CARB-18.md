---
id: CARB-18
title: Keep large graphs smooth with levels of detail
type: improvement
status: todo
priority: high
labels: [canvas, performance]
wave: "1"
milestone: "M1 It flows"
---

Three LOD tiers (full card, compact card, chip), viewport culling, and results that bypass React state.

**Done when** panning a 1k-node graph holds 60 fps in the perf harness, and the tiers have screenshot tests.

- [ ] LOD tiers by zoom
- [ ] Culling
- [ ] Perf harness measurement in CI
