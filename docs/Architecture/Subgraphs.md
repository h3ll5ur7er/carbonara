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

A blueprint's inside is solved for the boundary flows its instances got: its body as a model, with its port nodes pinned to the instances' flows and its pins times their scale ([[crates/solver/src/subgraphs/expand.rs]]). Pins are soft, so if the inside can't match, the misses say why; belt overflow inside shows here.

- `analysis.getResults({ documentId, graph: <blueprint id> })` returns the inside of **all instances of that blueprint together**: flows and scales summed (nested instances included), limits multiplied by the number of instances. With one instance, the usual case, that is exactly that instance. A blueprint without instances is solved as designed: its pins as they are, its ports open.
- It is solved **lazily**: only when asked for, once per document version, reusing the solved model's cached components and summaries. Its results carry the document version they belong to.
- **Watching.** `analysis.watchResults({ documentId, graph })` makes every solve of the document publish that blueprint's results with `resultsChanged` too, until `analysis.unwatchResults` with the same arguments. Watches count, so two views of one blueprint each watch and unwatch. Closing the document drops its watches. The root graph's results are always published; clients that show only the root ignore other graphs.

**No per-instance results.** Inside a blueprint the canvas shows all its instances together, and says so ("2 instances" in the breadcrumbs). We decided against results per instance for [[CARB-39]]: a blueprint is one definition, and what you edit inside it is every copy at once, so the combined load is what that view is about (machines to build in total, belts that overflow anywhere); with one instance, the usual case, the numbers are exactly that instance's. Each instance's boundary flows and scale are on its card in the graph around. Should a view of one copy ever be needed, `getResults` can take a path of instance ids.

## Results

- An instance's `NodeResult` has its scale as `activity` and what crosses its ports as `inputs` and `outputs`. Its loose ports and boundary shortages are its `surplus` and `deficit` diagnostics.
- The solution says what each instance does inside (`Solution.instances`: port flows, the activity of each node, nested instances): from the summary's cheapest inside for compiled blueprints, exact for inlined ones. Totals count raw inputs and buildings inside instances; each instance is a copy of its blueprint with machines of its own, so machine counts are rounded up per instance.

## Tests that pin the behaviour

In [[crates/solver/tests/subgraphs.rs]]:

- **Compiled vs inlined:** for random blueprints (random bodies, ports, pins, limits; placed once, or inside another blueprint) with unlimited supply, summarised and inlined plans score the same in every objective tier. Plans that tie may route differently, so they are compared by score, not by flows.
- **Scale invariance:** scaling a blueprint's pins and limits and its targets scales what every objective tier scores and keeps the instance's scale.
- **Expansion:** an expanded instance's ports carry the flows the graph around gave it.
- **Cache:** instances share one summary; an edit around them reuses it; editing one blueprint recomputes only its own.

When the graph around can't supply an instance, a shortage can be explained in several places at the same cost (inside or around the instance), just as in a flat graph, and summarised and inlined plans may explain it differently.

## Interaction

The commands and gestures are on [[Design/Editor quality of life]] (Subgraphs); the editing rules for collapse and expand on [[Architecture/Documents]] (Collapse and expand).

- **Collapse** (`Ctrl+G`): the selection becomes a new blueprint, named after what leaves it ("Copper Wire line"), and an instance takes its place, selected. Ports are inferred from the flows that cross the selection. **Expand** (`Ctrl+Shift+G`) puts the nodes back.
- **Open** an instance (double-click, its card's *Open* button, or `Ctrl+↓`): the view zooms into its card, then the blueprint's graph grows in. **Leave** (`Ctrl+↑`, the breadcrumbs' up button, or any crumb) does the reverse: the graph above comes back zoomed into the instance and glides out to where the view was. With reduced motion both are instant.
- Inside, the canvas edits the blueprint's graph (every command names it as its `graph`), and its results are followed with `analysis.watchResults` while it's on screen ([[src/client/core/results-model.ts]]). The inspector, the totals, the heatmap and the Sankey overview describe the graph on screen, and the planner plans into it: `planning.planProduction` takes the `graph`, so the proposal's commands name the blueprint, its ids are free in the blueprint's graph and it's placed beside the blueprint's nodes ([[Architecture/Planning]]). Its ghost shows only on the graph it goes into.
- **Breadcrumbs** at the canvas's top-left: the factory, then each blueprint opened; double-click the last one (or `F2`) to rename the blueprint. The path is kept per document for the session, and cut back when an undo, expand or delete takes an opened instance away ([[src/client/features/subgraphs/path.ts]]).
- **Library** (`Ctrl+B`, the left panel): every blueprint of the document with its inputs and outputs and how often it's placed. Drag one onto the canvas (it follows as a ghost and lands where it's let go), or click it and then click where it goes; `Esc` cancels, and `Enter` on a card places it in the middle of the view. A blueprint can't be placed inside itself, or inside one it's part of. All copies share the blueprint: they compile to one blueprint in the model and so one summary, and an edit inside changes them all ([[src/managers/analysis.test.ts]]).
- Third-party packs expand blueprints in their plugin sandbox, like built-in ones ([[Architecture/Plugins]]).
