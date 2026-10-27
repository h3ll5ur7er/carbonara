---
id: CARB-49
title: Auto-arrange graphs
type: feature
status: backlog
priority: high
labels: [qol, engines]
wave: "2"
milestone: "M2 It's a game"
---

The `layout` engine (ELK layered, in the worker): left → right or top → bottom, whole graph or selection, locked nodes respected, animated.

**Done when** arranging the canonical scenes produces no overlaps and fewer crossings than the input (tests), with screenshot tests.

- [ ] Layout engine with tests
- [ ] Animated transitions
- [ ] Locked nodes
- [ ] New nodes from the recipe picker or quick-add avoid landing on existing ones (seen in [[CARB-74]])
