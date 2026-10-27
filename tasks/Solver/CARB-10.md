---
id: CARB-10
title: Build the LP model with tiered objectives and slack diagnostics
type: feature
status: done
priority: urgent
labels: [solver]
wave: "1"
milestone: "M1 It flows"
---

Implement the formulation from [[Architecture/Solver]] in `crates/solver`, TDD with proptest.

**Done when** the template pack's scenes solve correctly, the tiered objectives behave as specified, and every non-zero slack is reported per port.

- [x] Property tests first: flow conservation, pins respected, scale invariance
- [x] Variables and constraints for production, logistics, edges (soft caps), sources, pins
- [x] Lexicographic tiers solved sequentially
- [x] Cycles (the template's loop) and byproducts
- [x] Backend trait with `microlp`
- [x] Infeasible and unbounded cases return errors as values

## Notes

- Specification tests: [[crates/solver/tests/solve.rs]] (template water loop, slag byproduct, tier order, ratios, plugin constraints, errors). Properties: [[crates/solver/tests/properties.rs]] (flow conservation, bounds, pins, scale invariance of every tier, determinism); they passed 100 000 cases each.
- Five tiers instead of three: deficits and overflow are separate (deficits first) so an overloaded belt is reported rather than a starved consumer, and surplus is minimised last so free flows are determined. See [[Architecture/Solver]].
- Each slack of a solved tier is held at its value (± 1e-8 relative) rather than the tier's total: holding the total let later tiers move tiny shortages to other ports (spurious diagnostics). Proptest found two bugs on the way (too tight a tolerance → false infeasibility; the zero-tier shortcut loosening a node's own `max`); both have regression tests.
- Contract change (additive): `Unsolvable` (`"infeasible" | "unbounded"`) in the IR, re-exported from `src/contracts/solver.ts`.
