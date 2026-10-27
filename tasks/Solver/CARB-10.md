---
id: CARB-10
title: Build the LP model with tiered objectives and slack diagnostics
type: feature
status: todo
priority: urgent
labels: [solver]
wave: "1"
milestone: "M1 It flows"
---

Implement the formulation from [[Architecture/Solver]] in `crates/solver`, TDD with proptest.

**Done when** the template pack's scenes solve correctly, the tiered objectives behave as specified, and every non-zero slack is reported per port.

- [ ] Property tests first: flow conservation, pins respected, scale invariance
- [ ] Variables and constraints for production, logistics, edges (soft caps), sources, pins
- [ ] Lexicographic tiers solved sequentially
- [ ] Cycles (the template's loop) and byproducts
- [ ] Backend trait with `microlp`
- [ ] Infeasible and unbounded cases return errors as values
