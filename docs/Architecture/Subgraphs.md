# Subgraphs

Megafactories stay fast because they're hierarchical. A **blueprint** is a reusable subgraph with typed boundary ports (inputs and outputs). An **instance** places a blueprint inside a parent graph. The solver only sees each instance as a compact summary, and solves a blueprint's inside only when someone looks at it.

[TOC]

## Where it lives

Summaries, flattening and expansion live in the Rust solver ([[crates/solver/src/subgraphs/mod.rs]]): how subgraphs are summarised is one of the things the solver hides ([[Architecture/Solver]]), summarising takes dozens of small LPs that are cheapest next to the LP library, and the summary cache sits next to the component cache. The `compiler` engine only compiles every graph of a document (the root graph and each blueprint) into one IR model ([[src/engines/compiler/instances.ts]]) and maps the answers back.

| Document | IR |
| --- | --- |
| `blueprints` | `model.blueprints`, in blueprint id order, with one numbering of items for all graphs |
| `port` node (inside a blueprint) | A process with one rate: +1 of its item for an `in` port (the item enters here), −1 for an `out` port. `ports` lists them by port index: port nodes in id order |
| `instance` node | `kind: instance`, `blueprint`: the blueprint's index; no rates |
| Edge with `fromPort` / `toPort` | The same edge with the port's index. An edge to an instance without a port, through a port of the wrong direction or with another item is an `error` diagnostic and left out |

A blueprint that places itself (directly or through others; the editing engine prevents it, files may still hold it) is an `error` on its instances. Blueprint graphs compile like the root graph, so their diagnostics show up in their own results.

## What an instance means

- **Pins are the design.** A blueprint's pins say what it is built for. An instance's activity is its **scale** `t`: it runs the blueprint with every pin multiplied by `t` ("3 × Iron rods"). The graph around chooses `t`. A blueprint without pins has no design scale; its instances report activity 0 and do what their ports need.
- **Inside, everything balances.** Every port an edge can carry is carried exactly: nothing is dumped halfway or left starved inside. Only *loose* ports, which no edge can carry (a byproduct with nowhere to go, an input nothing feeds), dump or miss, and that shows as the instance's surplus or deficit of that item.
- **The boundary behaves like a machine's ports.** What the graph around doesn't supply is a deficit at the instance, what it doesn't take a surplus there.
- **Limits.** Node maxima inside (a limited source) and plugin constraints that hold at zero activity cap how far an instance runs. Constraints that zero activity breaks can't be summarised (see Inline).
- **Belt limits inside are the blueprint's business.** The graph around plans without them; expanding the blueprint shows where its belts overflow. Carrying them up would cost one LP row per belt and instance, which is what summaries avoid.

## Compile (bottom-up, cached)

The **coordinates** of a blueprint are the flow through each port, each loose port, and, with pins, its scale `t`. With the balance above and pins turned into ratios to `t` (`x − pin · t = 0`), the coordinates a blueprint can produce form a cone: the projection of its LP onto its boundary ([[crates/solver/src/subgraphs/summary.rs]]).

1. **Degrees of freedom.** Directional LPs over the cone, cut by `Σ coordinates = 1`, grow a set of independent points until no direction orthogonal to them leaves their span. The count is the cone's dimension: how many independent ways the blueprint runs.
2. **One degree of freedom**, the usual case (a module designed around a ratio): the summary is one **macro recipe**: rates per unit (one point of the cone, per unit of design scale, or of its largest flow without pins), the cost of the cheapest inside that produces it, and a maximum `t_max` from the limits (an LP along the ray). The instance becomes one process node with those rates, `max` and cost.
3. **A few degrees of freedom** (up to 4, at most 8 modes; for example a byproduct choice, or a bus passing through): the cone's extreme rays are its **modes**, found by growing a hull with directional LPs ([[crates/solver/src/subgraphs/hull.rs]]). Each mode becomes a node of its own, the ports become nodes whose flow is tied to the modes' by equality constraints, and the LP around picks a non-negative combination.
4. **Otherwise** the blueprint is **inlined**: its body is flattened into the LP around it, balanced (a `balanced` node kind: no slack where an edge can carry), with its pins tied to the instance's scale. That's exact but slower, so the results carry a `hint` diagnostic: "Blueprint "…" can run in 5 independent ways, so it is solved inline, which is slower. Pin machines inside it to fix their ratios, and it compiles into a macro recipe." Several modes that share limits are inlined too (a shared limit couples them), as are blueprints with constraints that zero activity breaks.

Blueprints placed inside blueprints are summarised first; their summary is part of the outer blueprint's body. A blueprint that can't run at all (its pins contradict each other, say) has no modes: its instances do nothing.

**Cache.** A summary is computed from the blueprint's **closure**: its body as a model of its own, with the blueprints it places (directly or deeper) renumbered and items renumbered densely. It is cached by a hash of the closure and checked for equality on a hit ([[crates/solver/src/subgraphs/closure.rs]]). All instances of a blueprint share one summary, the same blueprint in another document hits the same entry, and editing one blueprint recomputes only its own summary (and those of blueprints that place it). The pack and plugin settings need no key of their own: they reach the solver only as the rates, limits and costs in the closure. Like component solutions, the cache keeps only what the last solve used.

## Expand (top-down, lazy)

When you open an instance, its internal LP is solved with the boundary flows fixed to the values from the parent solution. That's cheap, and it only happens for what is on screen ([[CARB-38]]).

## Results

- An instance's `NodeResult` has its scale as `activity` and what crosses its ports as `inputs` and `outputs`. Its loose ports and boundary shortages are its `surplus` and `deficit` diagnostics.
- The solution says what each instance does inside (`Solution.instances`: port flows, the activity of each node, nested instances): from the summary's cheapest inside for compiled blueprints, exact for inlined ones. Totals count raw inputs and buildings inside instances; each instance is a copy of its blueprint with machines of its own, so machine counts are rounded up per instance.

## Tests that pin the behaviour

In [[crates/solver/tests/subgraphs.rs]]:

- **Compiled vs inlined:** for random blueprints (random bodies, ports, pins, limits; placed once, or inside another blueprint) with unlimited supply, summarised and inlined plans score the same in every objective tier. Plans that tie may route differently, so they are compared by score, not by flows.
- **Scale invariance:** scaling a blueprint's pins and limits and its targets scales what every objective tier scores and keeps the instance's scale.
- **Cache:** instances share one summary; an edit around them reuses it; editing one blueprint recomputes only its own.

When the graph around can't supply an instance, a shortage can be explained in several places at the same cost (inside or around the instance), just as in a flat graph, and summarised and inlined plans may explain it differently.

## Interaction

- Select nodes and press `Ctrl+G` to collapse them into a subgraph. Ports are inferred from the edges crossing the selection.
- Double-click an instance to zoom into it, with breadcrumbs to go back up.
- Blueprints live in a library panel and can be dragged into any graph, shown as a ghost until you place them (see [[Design/Editor quality of life]]).
