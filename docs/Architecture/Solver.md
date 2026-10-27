# Solver

The `solver` engine turns the solver IR into machine counts and flows. It's written in Rust (`crates/solver`), compiled to WASM (`crates/solver-wasm`), and runs in the backend worker. Its TS facade, `src/engines/solver/`, is the only code that knows WASM exists.

What it hides: the LP formulation, the LP backend, decomposition and caching, and how subgraphs are summarised ([[Architecture/Subgraphs]]).

[TOC]

## Input: the solver IR

The `compiler` engine builds the IR from the document, the pack and the pack's plugin hooks. The IR is defined once in Rust ([[crates/solver/src/ir.rs]]); `cargo test` writes its TypeScript twin to `src/contracts/ir/` (ts-rs), re-exported by [[src/contracts/solver.ts]], and CI fails when the two drift. Models and solutions cross the WebAssembly boundary as JSON text (`JSON.stringify`, `serde_json` with exact float round-trips): for a 10k-node model that takes about 18 ms where building and walking JS objects field by field (`serde-wasm-bindgen`) took about 33 ms. An incremental solver sends only **changes** across: `ModelChanges` to the model it sent last (new lengths, and the nodes, edges, constraints and blueprints that differ, by index) and gets back `SolutionChanges` to the solution it got last (the activities and flows that differ, the instances that differ, and slack lists only when they changed). The facade tells what changed by identity (models are immutable, and the compiler keeps the objects of what didn't change), and keeps the objects of instances whose numbers didn't change, so mapping back can tell too. A binary encoding is only worth it if the benchmarks say so.

The solver knows nothing about recipes, sources or sinks. It only sees:

- **Nodes** with an activity `x ≥ 0` and a list of `rates` (items per second per unit of activity; positive out, negative in). A recipe node's activity is its machine count; a source or sink is a node with one rate of ±1, so its activity is items per second. A **junction** has no rates and passes every item through. Nodes may have an upper bound `max`, a `pin` (the activity the user asked for) and a `cost`.
- **Edges** carrying one item from one node to another, with an optional `capacity` and a fixed `ratio`.
- **Constraints** from plugins: `Σ coefficient · activity ≤ / = / ≥ rhs`.
- **Blueprints** (`model.blueprints`): subgraphs with ports, placed by **instance** nodes; edges reach an instance through a port (`fromPort`, `toPort`). How they are summarised, and what an instance means, is in [[Architecture/Subgraphs]]. A **balanced** node is a process whose ports with edges carry exactly its rates (no surplus or deficit there); the solver uses it for the insides of inlined blueprints.

Items, nodes and edges are indices into flat arrays, and every rate is in items per second. `validate` rejects inconsistent models (indices out of range, non-finite numbers, ports that don't match, blueprints that place themselves); an invalid model is a compiler bug, so the solver facade throws. The IR version is 3 (3 added the change types).

The **solution** has the activity per node, the flow per edge, and the slacks that explain everything that couldn't be met: `surplus` and `deficit` per (node, item), `overflow` per edge, and `pinMisses` per node. For instances it adds what each one does (`instances`: port flows, the activity of every node inside, nested instances) and which blueprints had to be inlined (`inlined`).

## From documents to the IR

The `compiler` engine ([[src/engines/compiler/compile.ts]]) builds the model; `toResults` ([[src/engines/compiler/results.ts]]) maps the solution back to `AnalysisResults` ([[src/contracts/results.ts]]).

| Document | IR |
| --- | --- |
| `recipe` | Process node; activity = machine count. Rate per machine = amount / (time / building speed), after the plugin's `effectiveRecipe` (identity by default) with the node's fields checked against `nodeFields` and their defaults filled in. Cost 0 |
| `source` | Process node with rate +1; `maxPerSecond` → `max`. Cost 1 per item/s, so raw use is minimised |
| `sink` | Process node with rate −1; `targetPerSecond` → `pin` |
| `junction` | Junction |
| Machine pin / rate pin | `pin` = count / (rate ÷ the recipe's net rate of the item); misses are reported back in the pin's own unit |
| Edge `logistics` | `capacity`, converted from the pack's `units.rate` to items per second |
| Plugin `constraints` | `constraints`, over recipe nodes' activities (see [[Architecture/Plugins]], The hook pipeline) |
| `instance`, `port` | Instance nodes and blueprint ports ([[Architecture/Subgraphs]]); every blueprint compiles like the root graph, with one numbering of items for all |
| `note`, `frame` | Left out |

- **Deterministic:** node and edge ids are sorted, items are numbered in pack order, so the same document gives byte-identical IR whatever order its maps were built in (property-tested).
- **Never an invalid model:** unknown recipes, items, buildings, belts and dangling edges become `error` diagnostics and are left out. An edge carrying an item one of its ends doesn't trade stays in the model (the solver keeps it empty) with a diagnostic saying why.
- After solving, `derive` gives recipe nodes their metrics; totals count raw inputs per item and buildings per building (machine counts cleaned of noise, then rounded up).

## LP formulation

Built by `formulate` in [[crates/solver/src/formulation.rs]] and solved by `solve` in [[crates/solver/src/lib.rs]].

Variables, all `≥ 0`:

- `x_n`: activity of each node, at most its `max`
- `f_e`: flow on each edge
- `surplus(n,i)` per output port and `deficit(n,i)` per input port of a process node
- `overflow_e` per edge with a capacity; `above_n`, `below_n` per pinned node

Constraints:

- **Process node**, net rate `r` of item *i* (an item listed as input and output is netted): output `Σ f_out(n,i) + surplus(n,i) = r · x_n`, input `Σ f_in(n,i) + deficit(n,i) = |r| · x_n`
- **Edges** carry only what their ends trade: an edge whose process end doesn't make (or use) its item is fixed at zero
- **Junction:** flow in equals flow out per item; its activity is its throughput (`x_j = Σ f_in`)
- **Ratio:** `f_e = ratio · output`, where output is `r · x` for a process and the item's inflow for a junction
- **Capacity**, soft: `f_e − overflow_e ≤ cap_e`, so the UI can show *where* a belt is overloaded
- **Sources** are process nodes with one rate of +1; their supply is the node's `max`
- **Pins**, soft: `x_n − above_n + below_n = pin` (a rate pin on a recipe becomes an activity pin in the compiler)
- **Plugin constraints** are hard. They (and negative costs) are the only way to get `infeasible` or `unbounded`, returned as values (`Unsolvable`); everything else the user can ask for is soft and shows up as slack

**Objective tiers**, solved one after another (lexicographically) for numerical stability:

1. Pin misses `Σ above + below`
2. Deficits
3. Overflow. After deficits, because "this belt is overloaded" says more about a plan than "this machine is starved" when both explain the same shortfall
4. Cost `Σ cost · x`
5. Surplus. Last, so that choices left free (an unpinned sink after a pinned machine) take what is made instead of wasting it. Without it such flows would be arbitrary

After a slack tier is solved, it is **held**: its slacks at zero stay at exactly zero (they sit on their bound, so that stays feasible, and met pins stay exact), and the others keep their total (± 1e-8 relative). The cost tier holds its total the same way. Letting a held tier move a tiny amount of shortage to a port that had none showed up as spurious diagnostics, which is what holding the zeros prevents; among ports that already have a shortage, later tiers may choose any distribution with the same total. The tolerance exists because microlp's values are accurate to about 1e-8. So non-zero slacks, and the values around them, may be off by about 1e-8 relative; the readable-number formatting hides that. A slack is reported only when it's larger than 1e-7 of the quantity it qualifies (the port's throughput, the edge's flow, the pin).

**Pins are parameters.** Each pin row is a parameter row of the program (`Program::parameters`): its right-hand side may differ from one solve to the next. microlp can't load a basis through its public API, but its solutions can be cloned and their variables fixed again. So the first objective is solved with two adjustment columns per parameter row (`row + up − down = pin`), free but dearer than any slack (cost 2 against the 1 of a pin miss, so they stay at zero exactly), and then fixed at zero; that state is kept. A later solve of a component of the same shape (`fingerprint::shape`: everything but the pins' values) clones it and fixes the adjustments at the differences of the new pins instead of solving from scratch: the dual simplex needs a few pivots where a fresh LP needs thousands. The kept state is checked against the new program (everything but the parameter rows' right-hand sides must be equal) and the tiers, and the incremental `Solver` keeps it for the 8 most recently solved shapes. The result is as exact as a fresh solve (property-tested: same tier optima, met pins met exactly); where several plans are equally good, it may pick another one than a fresh solve would, and its last bits may differ.

All tiers are minimised in **one warm LP** ([[crates/solver/src/program.rs]]): each tier's total `t ≥ Σ terms` joins the objective `Σ t` when its turn comes, and holding a tier fixes its total (and adds `Σ zero slacks ≤ 0`). microlp re-optimises each step from the last optimal basis (dual simplex) instead of solving from scratch. As before, the leading slack tiers (pins, deficits, overflow) are tried together first; if they can't all be zero, they run one by one. Tiers with negative terms (negative costs) fall back to one fresh LP per tier, as does any step microlp fails.

Propagate mode is simply the case where most variables are pinned.

The LP handles **cycles** (recycling loops, water loops, Factorio quality recycling) natively. Probabilistic outputs are modelled as expected values, so they stay linear.

The LP library sits behind the `Backend` trait ([[crates/solver/src/program.rs]]): the formulation builds a backend-neutral `Program`, and `MicroLp` minimises it with `microlp`, driven directly (good_lp hid the warm restarts). A second backend (clarabel) only has to implement `minimise`; the trait's default `minimise_in_order` then solves one fresh LP per tier.

## Readable results

- Values are cleaned of floating-point noise and rationalised with continued fractions ([[src/utilities/numbers.ts]]). A value counts as a fraction when one with denominator ≤ 1000 is within 1e-7 relative of it, above the solver's noise (about 1e-8). The UI can then show `2/3` (`formatFraction`, denominators ≤ 100) and `66.6667%` (`formatPercent`, at most four decimals), and split machine counts into "4 × 100% + 1 × 37.5%" (`splitMachines`, `formatMachines`: whole machines first, then one machine for the rest).
- Rates are converted between items per second and the pack's or user's unit, and formatted as `12.5/min`, in [[src/utilities/units.ts]].
- **Diagnostics:** every non-zero slack maps to a concrete annotation: "−12.5/min Iron Plate", "belt over capacity by 15/min", "unused byproduct".

## Performance

1. **Off the UI thread:** the solver runs in the backend worker. The `analysis` manager ([[src/managers/analysis.ts]]) solves when `documentChanged` arrives, runs one analysis at a time per document, and collapses edits that arrive meanwhile into one more round. A result whose document version is no longer current is dropped, so `resultsChanged` only ever carries the latest version. A bug in an engine or plugin shows up as an `error` diagnostic on the document instead of leaving old numbers up. Blueprint graphs are solved only when asked for or watched ([[Architecture/Subgraphs]]).
2. **Incremental, edit by edit.** Each open document has its own `DocumentCompiler` (`PluginRuntime.compiler()`) and its own incremental `Solver`, and an edit costs about what it changed, not what the document holds:
   - **Compile:** the compiler ([[src/engines/compiler/compile.ts]]) remembers each node's and edge's draft and model object by id, with the document objects they came from (documents are immutable, so an unchanged node keeps its object), and compiles only those whose objects changed. The analysis manager passes it the editing manager's Immer patches as long as none are missing (versions follow one another); it then looks only at the nodes and edges they touch, and the edges at those nodes, and patches the lists of the last compile instead of building them again. Without patches it compares every node and edge with what it remembers. Either way the result is exactly what a fresh compile gives (property-tested with random edits, also through Immer).
   - **Transfer:** only `ModelChanges` go into WebAssembly and `SolutionChanges` come back (see Input). The `Solver` holds the last model and solution.
   - **Solve:** the graph is split into weakly connected components ([[crates/solver/src/decompose.rs]]); edges and plugin constraints both join nodes. Each component becomes a model of its own, renumbered (nodes, edges and items dense and in their original order) so an unchanged component gives the same model wherever it sits. The `Solver` ([[crates/solver/src/incremental.rs]]) caches each component's solution by a hash of its model, checks the model for equality on a hit, and keeps only what the last solve used, so the next edit hits and nothing older lingers. A component that changed only its pins starts from its last LP (see LP formulation). `solve` without a `Solver` still goes component by component; `solve_whole` solves one big LP (tests use it to check that both reach the same optimum).
   - **Map back:** `toResults` ([[src/engines/compiler/results.ts]]) keeps the result objects of nodes and edges whose model and numbers didn't change (and skips the plugin's `derive` for them), and what each instance adds to the totals while its solution is the same object.
3. **Hierarchy:** before decomposing, instances are replaced by their blueprints' summaries (macro recipes, or modes) or inlined, which flattens the model; summaries are cached per blueprint in the same `Solver`. See [[Architecture/Subgraphs]].
4. **Results bypass React state:** results land in the client's result store, and each node component subscribes to its own slot, so a solve re-renders only the nodes whose numbers changed. For now they travel as the plain `AnalysisResults` records from [[src/contracts/results.ts]]; typed arrays only if the benchmarks show the transfer matters. Building those records (one entry per node and edge) is most of what mapping back still costs for a large document: about 4 ms for 10k nodes.
5. **Backend trait:** `microlp` first, `clarabel` behind the same trait for very large models.

**Budgets** (checked in CI by `bench/`, see [[Development]]). The 500-node budget was 16 ms (one frame) and was relaxed to 100 ms by the project owner: a plan that recomputes while you edit still feels instant at 100 ms, and the canvas never waits for the solver anyway.

| Scenario | Edit → numbers on screen | Measured (27 Oct 2026, median) | Before ([[CARB-73]], same day) |
| --- | --- | --- | --- |
| 500-node component | < 100 ms | **4 ms** (p95 8 ms): compile 0.3, solve 3, map 0.6 | 60 ms |
| 10k-node flat graph | < 150 ms | **13 ms** (p95 17–25 ms): compile 1.2, solve 7, map 4 | 239 ms |
| 50k-node factory built from subgraphs | < 50 ms | **18–20 ms** (p95 28 ms): compile 2, solve 9, map 6–7 | 166 ms |

Measured, not budgeted: an edit that changes a 500-node component's shape (a new sink, so its LP can't start from the last one) takes 59–60 ms (solve 58); a 50k-node flat graph of 100 components 74–76 ms (was 909); editing the blueprint of the subgraph factory, which re-solves every line, 175–200 ms (was 809).

The CI job `Performance budgets` runs the bench and the canvas frame budgets ([[Design]], Performance), prints the numbers, and fails the build when a budget doesn't hold. Its runners measured about as fast as the cloud machine these numbers come from (500 nodes 53 ms and 10k nodes 133 ms there before [[CARB-73]], against 60 and 239 here).

`bench/factories.ts` generates production lines of motor cells from the template pack (water loop, slag byproduct, belt capacities, one machine pin per cell) and makes its edits with Immer, as the editing engine does; `bench/run.ts` times edit → results the way the analysis manager does it (the document's compiler with the edit's patches, its incremental solver, mapping back), and prints each phase and the CPU time beside the wall time. `pnpm bench 10k` runs only the scenarios whose name contains "10k". The subgraph factory places one motor-cell blueprint 26 times per line on 100 lines (about 50k nodes once expanded); its edit changes one cell's target. A second scenario edits the blueprint itself, which changes every line. Release WebAssembly in Node 22 on a shared cloud machine; the numbers are medians of 5–30 edits, from a run whose CPU time matched its wall time (on this machine, load from other work can double wall times).

`cargo run --release --example profile -p carbonara-solver -- model.json [rounds] [edited.json]` times a model the compiler built (as JSON) natively: warm against cold tiers, validation, a re-solve with every component cached, and with a second model (the first after an edit) edits back and forth as the WebAssembly `Solver` gets them.

What changed ([[CARB-73]]), and what each bought:

- **One warm LP for all tiers** (see LP formulation): natively 45–50 ms instead of 115 ms for the three cold LPs a 500-node plan without shortages needed. Holding a tier's slacks by their total instead of one by one is what makes it warm-startable; one by one, the holds alone cost 150 ms.
- **Lazy validation:** checking a 10k-node model took 18 ms because every check formatted its path; now 0.3 ms.
- **JSON at the WebAssembly boundary:** a 10k-node model goes in in about 18 ms instead of 33 ms.
- **Compiling what changed** (by object, then by the edit's patches): 95 ms → 1.2 ms for 10k nodes, 77 ms → 2 ms for the subgraph factory. Comparing every object costs more than it sounds at this size: listing a 50k-key record (`Object.keys`) alone takes about 9 ms, which is why the patches matter.
- **Sending changes across the boundary:** the solve phase of the subgraph factory 46 → 17 ms (the whole model no longer crosses on each edit).
- **Mapping back what changed:** 33 → 4 ms for 10k nodes, 44 → 6 ms for the subgraph factory.
- **Pin edits start from the component's last LP:** natively 2.3 ms instead of 44 ms for the 500-node component.

Where the time goes now, and what would help:

- **Edits that change a component's shape** solve its LP from scratch: about 58 ms in WebAssembly for 500 nodes (2,600 variables, 1,800 rows). Presolving (fixed slacks, ports with a single edge) or a network-simplex special case for components without plugin constraints would cut that; it isn't needed for a budget now.
- **What's still O(document) per edit:** in Rust, validating, flattening, decomposing and fingerprinting the whole model (natively about 5 ms for the subgraph factory, most of its 9 ms solve phase); in TS, comparing the model's arrays for changes and building the result records. A Rust `Solver` that applies the changes to its decomposition instead of decomposing again would take the first off.
