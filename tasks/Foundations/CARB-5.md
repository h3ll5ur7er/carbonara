---
id: CARB-5
title: Define the document contract
type: feature
status: todo
priority: urgent
labels: [contracts, documents]
wave: "0"
---

zod schema for a Carbonara document v1 plus a migration chain, so documents saved today open forever.

**Done when** the schema covers the node and edge kinds below, positions are separate from the logical graph, and a migration test runs a v0 fixture through the chain.

- [ ] Tests first: round-trip, unknown version, migration chain order
- [ ] Nodes: recipe, source, sink, splitter/merger, bus, subgraph instance, note, group frame
- [ ] Edges: item, logistics tier, optional fixed split ratio
- [ ] Blueprints (subgraph definitions), per-node plugin fields, pins
- [ ] Layout stored separately from the logical graph
- [ ] Pack reference: id, version, hash
- [ ] `migrate(doc)` chain with one sample migration
