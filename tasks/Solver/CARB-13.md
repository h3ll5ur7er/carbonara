---
id: CARB-13
title: Show rates as readable numbers
type: feature
status: done
priority: medium
labels: [solver, ui]
wave: "1"
milestone: "M1 It flows"
---

Epsilon cleanup and rationalisation with continued fractions (a utility), plus splitting machine counts into buildable groups ("4 × 100% + 1 × 37.5%").

**Done when** property tests show the displayed value is within tolerance of the true one and common fractions (1/3, 2/3, 5/8) display exactly.

- [x] Continued-fraction rationaliser with tests
- [x] Machine-count splitting with tests
- [x] Unit formatting (/s, /min, /h)

## Notes

- [[src/utilities/numbers.ts]] (`rationalise`, `clean`, `formatNumber`, `formatFraction`, `formatPercent`, `splitMachines`, `formatMachines`) and [[src/utilities/units.ts]] (`toPerSecond`, `fromPerSecond`, `formatRate`), with fast-check properties: within tolerance, small fractions found exactly in lowest terms, machine groups add up with at most one partial machine.
- Tolerance 1e-7 relative: above the solver's ~1e-8 noise. Large values may snap to a fraction with a larger denominator (still within 1e-7 relative), which is harmless for display.
- Machine counts split as "whole machines at 100% + one for the rest", as the task says; an even underclock ("5 × 87.5%") would be a later option if packs want it.
