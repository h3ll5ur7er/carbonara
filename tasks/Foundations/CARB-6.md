---
id: CARB-6
title: Define the solver IR
type: feature
status: todo
priority: urgent
labels: [contracts, solver]
wave: "0"
---

The IR from [[Architecture/Solver]], defined once in Rust (serde) with TS types generated from it, and `postcard` encoding across the WASM boundary.

**Done when** a TS-built IR round-trips through WASM unchanged (golden test), and the generated TS types are checked in CI to be up to date.

- [ ] Rust types: Node, Edge, Extra, Macro, Objective tiers, Pin
- [ ] TS types generated (tsify or ts-rs); a check fails when they drift
- [ ] postcard encode/decode in TS and Rust, golden fixture test both ways
- [ ] Solution type: machine counts, flows, slacks per port, status
