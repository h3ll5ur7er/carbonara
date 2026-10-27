# Subgraphs

Megafactories stay fast because they're hierarchical. A **blueprint** is a reusable subgraph with typed boundary ports (inputs and outputs). An **instance** places a blueprint inside a parent graph. The solver only sees each instance as a compact summary, and solves a blueprint's inside only when someone looks at it.

[TOC]

## Compile (bottom-up, cached)

The feasible set of boundary flows is the projection of the subgraph's internal LP onto its ports. We handle the common cases exactly:

- **One degree of freedom**, the usual case (a module designed around a ratio): the summary is one **macro recipe** `v`, plus an optional capacity `t_max` from fixed machine counts or belt limits. The instance behaves exactly like a recipe node with a scale factor.
- **A few degrees of freedom** (up to about 4, for example a byproduct choice): extreme points are enumerated with directional LPs, giving a *multi-mode* macro node. The parent LP picks a non-negative combination of the modes.
- **Otherwise:** the subgraph is *inlined* (flattened into the parent LP). That's correct but slower, so the UI suggests pins that would make it compile.

Summaries are cached by the hash of the blueprint's IR, the pack hash and the plugin settings. All instances of a blueprint share one summary; editing the blueprint invalidates exactly that entry.

## Expand (top-down, lazy)

When you open an instance, its internal LP is solved with the boundary flows fixed to the values from the parent solution. That's cheap, and it only happens for what is on screen.

## Interaction

- Select nodes and press `Ctrl+G` to collapse them into a subgraph. Ports are inferred from the edges crossing the selection.
- Double-click an instance to zoom into it, with breadcrumbs to go back up.
- Blueprints live in a library panel and can be dragged into any graph, shown as a ghost until you place them (see [[Design/Editor quality of life]]).

## Tests that pin the behaviour

- Scale invariance: solving an instance at scale `t` equals solving the inlined subgraph with targets scaled by `t`.
- Compiled vs inlined: for random small blueprints, both give the same boundary flows.
- Cache: editing one blueprint invalidates only its own summary.
