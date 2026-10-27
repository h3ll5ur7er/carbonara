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

## LP formulation

Variables:

- `x_n ≥ 0`: machine count for each production node (continuous)
- `f_e ≥ 0`: flow on each edge
- `s⁺`, `s⁻`: surplus and deficit slack for each (node, item) port

Constraints:

- **Production node**, output item *i*: `Σ f_out(n,i) + surplus(n,i) = x_n · r_out(n,i)`
- **Production node**, input item *i*: `Σ f_in(n,i) + deficit(n,i) = x_n · r_in(n,i)`
- **Logistics** (splitter, merger, bus): flow in equals flow out per item; split ratios are optional
- **Edges:** `f_e ≤ cap_e`, soft, with an overflow slack so the UI can show *where* a belt is overloaded
- **Sources:** `Σ out ≤ supply`
- **Pins:** `x_n = pin`, soft, with a miss slack (a rate pin on a recipe becomes an activity pin in the compiler)

**Objective tiers**, solved one after another for numerical stability:

1. Meet pinned targets.
2. Minimise deficits and overflow.
3. Minimise user-weighted cost (raw resources, power, building count).

Propagate mode is simply the case where most variables are pinned.

The LP handles **cycles** (recycling loops, water loops, Factorio quality recycling) natively. Probabilistic outputs are modelled as expected values, so they stay linear.

## Readable results

- Values are cleaned of floating-point noise and rationalised with continued fractions. The UI can then show `2/3` and `66.6667%`, and split machine counts into "4 × 100% + 1 × 37.5%".
- **Diagnostics:** every non-zero slack maps to a concrete annotation: "−12.5/min Iron Plate", "belt over capacity by 15/min", "unused byproduct".

## Performance

1. **Off the UI thread:** the solver runs in the backend worker. `analysis` tags each solve with a generation number and drops stale results.
2. **Incremental:** the graph is split into weakly connected components, and only *dirty* components are re-solved. Results are cached by a hash of each component's IR.
3. **Hierarchy:** subgraphs compile to macro recipes; see [[Architecture/Subgraphs]].
4. **Results bypass React state:** results travel as typed arrays and land in the client's result store. Each node component subscribes to its own slot, so a solve re-renders only the nodes whose numbers changed.
5. **Backend trait:** `microlp` first, `clarabel` behind the same trait for very large models.

**Budgets** (checked in CI by `bench/`):

| Scenario | Edit → numbers on screen |
| --- | --- |
| 500-node component | < 16 ms |
| 10k-node flat graph | < 150 ms |
| 50k-node factory built from subgraphs | < 50 ms |
