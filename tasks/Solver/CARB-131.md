---
id: CARB-131
title: Re-solving for new pins from the last solve misses the optimum in a proptest case
type: bug
status: backlog
priority: medium
labels: [solver]
---

Found while checking [[CARB-95]] and [[CARB-105]] (neither touches Rust): `cargo test -p carbonara-solver --test incremental` failed on a random case of `re_solving_for_new_pins_from_the_last_solve_reaches_the_same_optimum` ([[crates/solver/tests/incremental.rs]]), and kept failing once proptest had saved the seed:

```
Test failed: tier 3: [-0.0, 0.75, -0.0, 0.5, 1.5] vs [-0.0, 0.75, -0.0, 0.25, -0.0] at crates/solver/tests/incremental.rs:235.
cc 3b5b41abe1e81954857f394e389d680703430180758bda4982045013bedfa09b # shrinks to factory = Model { items: 4, nodes: [Node { kind: Process, rates: [Rate { item: 1, per_second: -3.0 }], max: Some(1.5), pin: Some(5.5), cost: 1.0, blueprint: None }, Node { kind: Process, rates: [Rate { item: 1, per_second: 1.5 }, Rate { item: 3, per_second: -1.5 }, Rate { item: 2, per_second: 3.0 }], max: None, pin: None, cost: 0.5, blueprint: None }], edges: [Edge { from: 1, to: 0, item: 1, capacity: None, ratio: None, from_port: None, to_port: None }], constraints: [], blueprints: [] }, pins = [0.25, 0.25, 3.5, 3.5, 3.5, 0.0, 1.0, 2.0, 0.25, 2.0]
```

The seed line above goes into `crates/solver/tests/incremental.proptest-regressions` to reproduce it. In the shrunk case a node pinned beyond its `max` takes item 1 from a process whose own input nothing supplies; the warm-started re-solve (the pin-edit path of [[CARB-73]]) and the solve from scratch agree on the first tiers and differ in tier 3. Not investigated further.

**Done when** the case passes (a fix in the warm start, or the test compares what the tiers promise if both answers are optimal), with the seed kept in the regressions file.

- [ ] Reproduce with the seed and find which tier first differs
- [ ] Fix, or tighten what the test compares, with a reason
