---
id: CARB-13
title: Show rates as readable numbers
type: feature
status: todo
priority: medium
labels: [solver, ui]
wave: "1"
milestone: "M1 It flows"
---

Epsilon cleanup and rationalisation with continued fractions (a utility), plus splitting machine counts into buildable groups ("4 × 100% + 1 × 37.5%").

**Done when** property tests show the displayed value is within tolerance of the true one and common fractions (1/3, 2/3, 5/8) display exactly.

- [ ] Continued-fraction rationaliser with tests
- [ ] Machine-count splitting with tests
- [ ] Unit formatting (/s, /min, /h)
