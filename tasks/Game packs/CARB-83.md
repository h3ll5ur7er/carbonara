---
id: CARB-83
title: Count by id without prototype keys
type: bug
status: done
priority: low
labels: [engines]
wave: "3"
milestone: "M4 Ship"
---

Satisfactory's `constructor` building was counted as `{}["constructor"]`, the `Object` function, and summed into a string ([[CARB-45]] fixed the two places it hit). Any id equal to an `Object.prototype` key (`constructor`, `toString`, `valueOf` …) can do the same wherever a plain object is used as a map with `x[id] ?? 0`.

- [x] A property test that runs the compiler and the analysis with items, buildings and recipes named after every `Object.prototype` key ([[src/managers/analysis.prototype-keys.test.ts]]; the renamings are in [[src/engines/compiler/prototype-keys.fixture.ts]])
- [x] The same for the planner, accepting its proposals into a document ([[src/managers/planning.prototype-keys.test.ts]])
- [x] Count into `Map`s or null-prototype objects where it fails: `own` and `addTo` in [[src/utilities/records.ts]]

## What failed and what changed

The properties rename some of the template pack's items, buildings and recipes to keys such as `propertyIsEnumerable` or `__defineGetter__` and expect the same results under the new names. Before the fix they failed in:

- the compiler's results: node inputs and outputs, raw totals, and the totals and boundary flows of blueprint instances (`"function propertyIsEnumerable() { [native code] }0.5"`);
- the planner: `makes`/`uses` read `recipe.out[item]`, so a renamed item had no producers and the plan came out empty; the proposal's shortfalls;
- the editing engine: a proposal names its nodes after its recipes, and `graph.nodes[id]` said "Node __defineGetter__ already exists".

All of these now read and add with `own` / `addTo`, and `in` checks on nodes and blueprints are `Object.hasOwn`. The client's tallies (recipe picker usage, totals card, deficits on cards, MCP graph summaries, the inspector's balance, terminal nodes) got the same treatment. The rule is in [[Conventions]] (Code style).

## Decision: the pack format keeps these ids

The `Id` pattern (lowercase, starting with a letter or digit) already refuses every `Object.prototype` key but `constructor`, and zod drops `__proto__` from the records it parses. Refusing `constructor` too would break Satisfactory's Constructor and every document that uses it, and it would make a JavaScript quirk part of the pack format that pack authors must know. Ids are the games' names, so the code adapts: it reads records by own keys only. A contract test in [[src/contracts/pack.test.ts]] pins that `constructor` is the only key the pattern allows; the property tests still use the others, so a looser pattern later stays safe. `__proto__` is left out of the properties, since no pack or document can carry it.
