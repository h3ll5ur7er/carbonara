# Solver

The `solver` engine turns the solver IR into machine counts and flows. It's written in Rust (`crates/solver`), compiled to WASM (`crates/solver-wasm`), and runs in the backend worker. Its TS facade, `src/engines/solver/`, is the only code that knows WASM exists.

What it hides: the LP formulation, the LP backend, decomposition and caching, and how subgraphs are summarised ([[Architecture/Subgraphs]]).

[TOC]

## Input: the solver IR

The `compiler` engine builds the IR from the document, the pack and the pack's plugin hooks. The IR is compact and indexed: items, nodes and edges are `u32` indices into flat arrays. It's defined once in Rust (serde) with generated TS types, and encoded with `postcard` across the WASM boundary.

```
Node      { kind, rates: SparseVec<item, f64>, pins: Pin[], cost: f64[] }
Edge      { from, to, item, cap: Option<f64>, ratio: Option<f64> }
Extra     { linear constraints & variables contributed by plugins }
Macro     { compiled subgraph summary: modes: SparseVec[], cap: Option<f64> }
Objective { lexicographic tiers of weighted terms }
```

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
- **Pins:** a user-fixed machine count or output target becomes an equality

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
