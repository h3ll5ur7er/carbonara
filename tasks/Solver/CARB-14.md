---
id: CARB-14
title: Compile documents into solver IR
type: feature
status: todo
priority: urgent
labels: [engines]
wave: "1"
milestone: "M1 It flows"
---

The `compiler` engine: document + pack → IR, and solution → per-node and per-edge results. Plugin hooks are called here, but in this wave only through identity defaults (the hook pipeline is [[Architecture/Plugins]] work).

**Done when** compiling the template scenes is deterministic (same input → byte-identical IR) and results map back to the right nodes and ports.

- [ ] Tests first: determinism, mapping back, unknown ids reported
- [ ] Nodes, edges, pins, logistics capacities from pack data
- [ ] Hook call sites with identity defaults
