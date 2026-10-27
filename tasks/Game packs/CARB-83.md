---
id: CARB-83
title: Count by id without prototype keys
type: bug
status: todo
priority: low
labels: [engines]
wave: "3"
milestone: "M4 Ship"
---

Satisfactory's `constructor` building was counted as `{}["constructor"]`, the `Object` function, and summed into a string ([[CARB-45]] fixed the two places it hit). Any id equal to an `Object.prototype` key (`constructor`, `toString`, `valueOf` …) can do the same wherever a plain object is used as a map with `x[id] ?? 0`.

- [ ] A property test that runs the compiler and the analysis with items, buildings and recipes named after every `Object.prototype` key
- [ ] Count into `Map`s or null-prototype objects where it fails
