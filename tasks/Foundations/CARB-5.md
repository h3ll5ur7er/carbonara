---
id: CARB-5
title: Define the document contract
type: feature
status: done
priority: urgent
labels: [contracts, documents]
wave: "0"
---

zod schema for a Carbonara document v1 plus a migration chain, so documents saved today open forever.

**Done when** the schema covers the node and edge kinds below, positions are separate from the logical graph, and a migration test runs a v0 fixture through the chain.

- [x] Tests first: round-trip, unknown version, migration chain order
- [x] Nodes: recipe, source, sink, junction (splitter/merger/bus), instance, port, note, frame
- [x] Edges: item, logistics tier, optional fixed split ratio
- [x] Blueprints (subgraph definitions), per-node plugin fields, pins
- [x] Layout stored separately from the logical graph
- [x] Pack reference: id, version, hash
- [x] `upgradeDocument(raw)` migration chain in the documents access component, with the 0 → 1 migration (positions moved into `layout`)

**Decisions** (recorded in [[Architecture/Documents]])

- Rates are stored in items per second everywhere; packs' units are converted on load.
- Nodes and edges are maps keyed by id, for stable patch paths.
- Splitters, mergers and buses are one `junction` kind (KISS); the canvas can still draw them differently later.
- Migrations live in the documents access component: they're about how documents are stored.
