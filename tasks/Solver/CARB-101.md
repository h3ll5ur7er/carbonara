---
id: CARB-101
title: Speed up edits that change a component's shape
type: improvement
status: backlog
priority: low
labels: [solver, performance]
milestone: "M3 Megafactory"
---

Found in [[CARB-73]]. Pin edits now start from the component's last LP (4 ms for the 500-node component), but an edit that changes the component's shape (a node or flow added, a recipe changed) solves its LP from scratch: 58 ms in WebAssembly for 500 nodes, under the 100 ms budget but most of the edit ([[Architecture/Solver]], Performance; bench scenario "the same, adding a sink").

Options, to be chosen by profiling: presolve the program (fixed slacks, flows fixed at zero, ports with a single edge), a network-simplex path for components without plugin constraints, or carrying the last basis across shape changes if microlp ever exposes loading one. Also still O(document) per edit: validating, flattening, decomposing and fingerprinting the whole model in Rust (natively about 5 ms for the 50k-node subgraph factory); applying `ModelChanges` to the last decomposition would take that off.

- [ ] Profile the cold 500-node LP and the Rust per-edit overhead
- [ ] The fix the profile points to, with a bench
