# Solver

The `solver` engine turns the solver IR into machine counts and flows. It's written in Rust (`crates/solver`), compiled to WASM (`crates/solver-wasm`), and runs in the backend worker. Its TS facade, `src/engines/solver/`, is the only code that knows WASM exists.

What it hides: the LP formulation, the LP backend, decomposition and caching, and how subgraphs are summarised ([[Architecture/Subgraphs]]).

[TOC]

## Input: the solver IR

The `compiler` engine builds the IR from the document, the pack and the pack's plugin hooks. The IR is defined once in Rust ([[crates/solver/src/ir.rs]]); `cargo test` writes its TypeScript twin to `src/contracts/ir/` (ts-rs), re-exported by [[src/contracts/solver.ts]], and CI fails when the two drift. Values cross the WebAssembly boundary as plain JS objects (`serde-wasm-bindgen`). A binary encoding is only worth it if the benchmarks say so.

The solver knows nothing about recipes, sources or sinks. It only sees:

- **Nodes** with an activity `x ≥ 0` and a list of `rates` (items per second per unit of activity; positive out, negative in). A recipe node's activity is its machine count; a source or sink is a node with one rate of ±1, so its activity is items per second. A **junction** has no rates and passes every item through. Nodes may have an upper bound `max`, a `pin` (the activity the user asked for) and a `cost`.
- **Edges** carrying one item from one node to another, with an optional `capacity` and a fixed `ratio`.
- **Constraints** from plugins: `Σ coefficient · activity ≤ / = / ≥ rhs`.

Items, nodes and edges are indices into flat arrays, and every rate is in items per second. `validate` rejects inconsistent models (indices out of range, non-finite numbers); an invalid model is a compiler bug, so the solver facade throws.

The **solution** has the activity per node, the flow per edge, and the slacks that explain everything that couldn't be met: `surplus` and `deficit` per (node, item), `overflow` per edge, and `pinMisses` per node.

## From documents to the IR

The `compiler` engine ([[src/engines/compiler/compile.ts]]) builds the model; `toResults` ([[src/engines/compiler/results.ts]]) maps the solution back to `AnalysisResults` ([[src/contracts/results.ts]]).

| Document | IR |
| --- | --- |
| `recipe` | Process node; activity = machine count. Rate per machine = amount / (time / building speed), after the plugin's `effectiveRecipe` (identity by default) with the node's fields filled from `nodeFields` defaults. Cost 0 |
| `source` | Process node with rate +1; `maxPerSecond` → `max`. Cost 1 per item/s, so raw use is minimised |
| `sink` | Process node with rate −1; `targetPerSecond` → `pin` |
| `junction` | Junction |
| Machine pin / rate pin | `pin` = count / (rate ÷ the recipe's net rate of the item); misses are reported back in the pin's own unit |
| Edge `logistics` | `capacity`, converted from the pack's `units.rate` to items per second |
| `instance`, `port` | Not compiled yet (subgraphs, Wave 2): an `error` diagnostic |
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

After a slack tier is solved, **each of its slacks is held**: a zero slack at exactly zero (it sits on its bound, so that stays feasible, and met pins stay exact), a positive one at its value ± 1e-8 relative. The cost tier holds only its total (± 1e-8 relative). Holding only a slack tier's total let later tiers shift a tiny amount of shortage to another port, which showed up as spurious diagnostics. The tolerance exists because microlp's values are accurate to about 1e-8; holding positive values exactly made feasible models infeasible. So non-zero slacks, and the values around them, may be off by about 1e-8 relative; the readable-number formatting hides that. A slack is reported only when it's larger than 1e-7 of the quantity it qualifies (the port's throughput, the edge's flow, the pin).

Propagate mode is simply the case where most variables are pinned.

The LP handles **cycles** (recycling loops, water loops, Factorio quality recycling) natively. Probabilistic outputs are modelled as expected values, so they stay linear.

The LP library sits behind the `Backend` trait ([[crates/solver/src/program.rs]]): the formulation builds a backend-neutral `Program`, and `MicroLp` minimises it with `good_lp` + `microlp`. A second backend (clarabel) only has to implement `minimise`.

## Readable results

- Values are cleaned of floating-point noise and rationalised with continued fractions ([[src/utilities/numbers.ts]]). A value counts as a fraction when one with denominator ≤ 1000 is within 1e-7 relative of it, above the solver's noise (about 1e-8). The UI can then show `2/3` (`formatFraction`, denominators ≤ 100) and `66.6667%` (`formatPercent`, at most four decimals), and split machine counts into "4 × 100% + 1 × 37.5%" (`splitMachines`, `formatMachines`: whole machines first, then one machine for the rest).
- Rates are converted between items per second and the pack's or user's unit, and formatted as `12.5/min`, in [[src/utilities/units.ts]].
- **Diagnostics:** every non-zero slack maps to a concrete annotation: "−12.5/min Iron Plate", "belt over capacity by 15/min", "unused byproduct".

## Performance

1. **Off the UI thread:** the solver runs in the backend worker. `analysis` tags each solve with a generation number and drops stale results.
2. **Incremental:** the graph is split into weakly connected components ([[crates/solver/src/decompose.rs]]); edges and plugin constraints both join nodes. Each component becomes a model of its own, renumbered (nodes, edges and items dense and in their original order) so an unchanged component gives the same model wherever it sits. A `Solver` ([[crates/solver/src/incremental.rs]]) caches each component's solution by a hash of its model, checks the model for equality on a hit, and keeps only what the last solve used: one `Solver` per document, so the next edit hits and nothing older lingers. `solve` without a `Solver` still goes component by component; `solve_whole` solves one big LP (tests use it to check that both reach the same optimum).
3. **Hierarchy:** subgraphs compile to macro recipes; see [[Architecture/Subgraphs]].
4. **Results bypass React state:** results travel as typed arrays and land in the client's result store. Each node component subscribes to its own slot, so a solve re-renders only the nodes whose numbers changed.
5. **Backend trait:** `microlp` first, `clarabel` behind the same trait for very large models.

**Budgets** (checked in CI by `bench/`):

| Scenario | Edit → numbers on screen |
| --- | --- |
| 500-node component | < 16 ms |
| 10k-node flat graph | < 150 ms |
| 50k-node factory built from subgraphs | < 50 ms |
