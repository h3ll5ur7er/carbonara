# Documents

A document is one factory plan: a graph of nodes and edges, the blueprints its subgraph instances use, and where everything sits on the canvas. It's saved as a `.carbonara` file (gzipped JSON), autosaved, and shared as a link. The contract is [[src/contracts/document.ts]]; a document using every node kind is [[src/contracts/document.fixture.ts]].

[TOC]

## Structure

```yaml
format: carbonara
version: 1
id: doc-1
name: Iron
pack: { id: satisfactory, version: 1.2.0, hash: sha256-… }   # the pack it was planned with
graph:                                  # the root graph
  nodes: { <id>: <node>, … }
  edges: { <id>: <edge>, … }
blueprints:                             # subgraph definitions, see Subgraphs
  <id>: { name: Iron rods, graph: { nodes, edges } }
layout:                                 # positions, per graph: `root` or a blueprint id
  root: { <node id>: { x, y, width?, height? } }
settings: { rateUnit: per_minute }      # display unit for this document
```

Nodes and edges are maps keyed by id, not arrays. That keeps patch paths stable (`graph/nodes/smelt/fields/clock`) for undo, events and MCP tools.

**Positions live in `layout`, not on the nodes**, so moving a node never touches the logical graph and never triggers a re-solve.

## Node kinds

| Kind | Fields | Meaning |
| --- | --- | --- |
| `recipe` | `recipe`, `building?`, `fields?`, `pin?` | Machines running a recipe. `fields` holds the plugin's node fields (clock, modules …) |
| `source` | `item`, `maxPerSecond?` | Where an item enters the graph: a resource or an import |
| `sink` | `item`, `targetPerSecond?` | Where an item leaves: a goal or an export |
| `junction` | — | Splits and merges flows. Splitters, mergers and bus segments are all junctions |
| `instance` | `blueprint` | A placed blueprint; its ports are the blueprint's `port` nodes |
| `port` | `direction`, `item` | A blueprint's boundary (only inside blueprints) |
| `note` | `text` | A sticky note |
| `frame` | `label`, `tone?` | A group frame; its size is in `layout` |

**Pins** are values the solver must meet exactly: `{ type: machines, count }` or `{ type: rate, item, perSecond }`.

## Edges

`{ from, to, item, fromPort?, toPort?, logistics?, ratio? }`. Most nodes connect by item; instance nodes connect through a port (the id of the blueprint's port node). `logistics` is the belt or pipe tier and caps the flow at its capacity; `ratio` fixes the edge's share of the source node's output of that item.

## Units

Documents and the solver IR store every rate in **items per second**. Packs state capacities in their own unit (`units.rate`), and the compiler converts them on load. The document's `settings.rateUnit` (or the pack's unit) only affects what the UI shows. One internal unit means no conversion bugs between layers. The rational display ([[Architecture/Solver]]) hides float noise such as 20/min = 0.333… /s.

## Versions and migrations

`version` is the document format version. When a stored document is older, the documents access component upgrades it step by step (`MIGRATIONS[n]` turns version n into n + 1, in [[src/access/documents/migrations.ts]]) before parsing it with the current schema. A document from a newer Carbonara is refused with a clear message rather than half-loaded.

To change the format: bump `CURRENT_DOCUMENT_VERSION`, add the migration and its test, and update this page.
