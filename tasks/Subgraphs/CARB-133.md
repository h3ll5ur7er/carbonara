---
id: CARB-133
title: A blueprint's summary misses a cheaper way of running
type: bug
status: todo
priority: high
labels: [solver, subgraphs]
wave: "3"
---

`summarised_and_inlined_blueprints_plan_equally_well` ([[crates/solver/tests/subgraphs.rs]]) found a blueprint whose summary plans worse than the same blueprint inlined, with no shortage and no missed pin: cost 4 summarised, 2 inlined. The blueprint can make its item inside (a process at 0.25/s, cost 0.5) or take it through its input port. The summary runs the inside process (8 × 0.5), and the inlined graph buys the input instead (2 × 1). So the summary's modes ([[CARB-36]], [[CARB-37]], `crates/solver/src/subgraphs/`) miss the cheaper mode, or cost it wrongly.

It isn't caused by the tier tie-break in `program.rs` (it fails the same with that reverted). The seed is at the end of this file. It is kept out of `subgraphs.proptest-regressions` until the fix, so CI stays green.

**Done when** the case passes with its seed in the regressions file, and the property tests run a few thousand cases cleanly.

- [ ] Reproduce with the seed; find whether the hull misses the mode, or the mode's cost is wrong
- [ ] Fix with a regression test

Seed (append to `crates/solver/tests/subgraphs.proptest-regressions` to reproduce):

```
cc 3766c4c18b1eb90c46575e9b7ee5d5c7335c678e8074f374c41e164db00dd3e6 # shrinks to blueprint = Blueprint { nodes: [Node { kind: Process, rates: [Rate { item: 3, per_second: -3.0 }], max: None, pin: None, cost: 2.0, blueprint: None }, Node { kind: Process, rates: [Rate { item: 3, per_second: 0.25 }], max: None, pin: None, cost: 0.5, blueprint: None }, Node { kind: Junction, rates: [], max: None, pin: None, cost: 0.0, blueprint: None }, Node { kind: Process, rates: [Rate { item: 3, per_second: 1.0 }], max: None, pin: None, cost: 0.0, blueprint: None }, Node { kind: Process, rates: [Rate { item: 3, per_second: -1.0 }], max: None, pin: None, cost: 0.0, blueprint: None }], edges: [Edge { from: 1, to: 2, item: 3, capacity: None, ratio: None, from_port: None, to_port: None }, Edge { from: 2, to: 0, item: 3, capacity: Some(3.0), ratio: None, from_port: None, to_port: None }, Edge { from: 0, to: 1, item: 1, capacity: None, ratio: None, from_port: None, to_port: None }, Edge { from: 1, to: 0, item: 1, capacity: None, ratio: None, from_port: None, to_port: None }, Edge { from: 2, to: 2, item: 3, capacity: None, ratio: None, from_port: None, to_port: None }, Edge { from: 0, to: 2, item: 2, capacity: None, ratio: None, from_port: None, to_port: None }, Edge { from: 3, to: 2, item: 3, capacity: None, ratio: None, from_port: None, to_port: None }, Edge { from: 2, to: 4, item: 3, capacity: None, ratio: None, from_port: None, to_port: None }], constraints: [], ports: [3, 4] }, targets = [Some(2.0), None, None]
```
