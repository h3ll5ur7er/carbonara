# Carbonara — Implementation Plan

A game-agnostic, node-based factory planner. It works in the browser and can be installed as a desktop app via Tauri. Game data is loaded from data packs, game mechanics come from plugins, and the solver core is written in Rust and compiled to WASM.

---

## 1. Guiding principles

1. **Everything is a linear flow problem.** Each mechanic (overclocking, modules, beacons, heat, quality, somersloops, alternate recipes) is turned into item flows plus linear constraints *before* the solver runs. Mechanics that are non-linear (for example the Satisfactory power curve) are computed as **derived metrics** after the solve. This keeps the core small, fast and generic, and plugins never need to touch Rust.
2. **One engine, two modes.** *Propagate* mode (Satisfactory-Modeler style: you place machines and see where flows run short or pile up) and *Optimize* mode (you state goals and the app chooses recipes and counts) are the same LP with different pins and objectives.
3. **The UI thread never waits.** Solving, plugin hooks, auto-layout and data-pack parsing all run in workers. The canvas only reads results.
4. **Hierarchy is the scaling strategy.** A subgraph compiles to a "macro recipe". The top level only solves macro nodes, and the inside of a subgraph is solved only when you open it.
5. **Contracts first, then parallel work.** The data-pack schema, document schema, solver IR and plugin API are fixed in Wave 0 so that the later waves can be built in parallel without conflicts.

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| App | Vite + React 19 + TypeScript (strict) | Fast iteration and a large ecosystem |
| Node editor | `@xyflow/react` (React Flow 12) behind our own `CanvasAdapter` interface | Best UX baseline (ports, handles, minimap, selection). The adapter keeps open the option of a WebGL renderer later if we need more than about 2k visible nodes |
| Styling | Tailwind v4 + CSS variables (design tokens), Radix primitives, `cmdk`, Motion | Full visual control, accessible primitives, smooth transitions |
| State | Zustand + Immer **patches** | Patches drive undo/redo *and* incremental sync to the worker |
| Worker RPC | Comlink + transferable `ArrayBuffer`s | Zero-copy result transfer, no JSON overhead on hot paths |
| Solver | Rust: `good_lp` modelling layer → `microlp` (pure Rust, WASM-friendly), with `clarabel` as a second backend behind a trait | No C toolchain in the WASM build. Backends can be swapped for very large models |
| WASM | `wasm-bindgen` + `wasm-pack`, `postcard` for IR encoding | Small binary and compact IR |
| Schemas | `zod` for data packs and documents (with JSON Schema generated for external authors). Solver IR is defined in Rust with TS types generated via `tsify` | Each layer has one source of truth |
| Layout | ELK.js (layered) in a worker | Good automatic layout for left-to-right production chains |
| Persistence | IndexedDB (Dexie) autosave; `.carbonara` files (gzipped JSON); share links | Works offline, and documents are portable |
| Desktop | Tauri 2 (same web bundle, native file I/O, menus, file associations, auto-update) | Little extra code needed |
| Tests | Vitest, `cargo test` + `proptest`, Playwright e2e + screenshot regression, `criterion` benchmarks | Visual regressions and performance budgets are checked in CI |
| Tooling | pnpm workspaces + Cargo workspace, Biome (lint/format), GitHub Actions | One install, one CI |

---

## 3. Repository layout

```
carbonara/
├─ apps/
│  ├─ web/                 # Vite React app (the product)
│  └─ desktop/             # Tauri 2 shell (src-tauri/), wraps apps/web build
├─ crates/
│  ├─ solver/              # graph IR, LP model builder, subgraph compiler, decomposition
│  └─ solver-wasm/         # wasm-bindgen bindings, postcard decode/encode
├─ packages/
│  ├─ schema/              # zod: GamePack, Document, migrations; emits JSON Schema
│  ├─ engine/              # doc→IR compiler, plugin host, solver worker, result store
│  ├─ canvas/              # CanvasAdapter + React Flow implementation, node/edge components
│  ├─ ui/                  # design system: tokens, primitives, icons, panels
│  └─ plugin-api/          # public types + definePlugin() for plugin authors
├─ plugins/
│  ├─ satisfactory/        # clock speed, somersloops, alternates, power curve, Docs.json importer
│  └─ factorio/            # modules, beacons, quality, heat, fluid temps, data-raw importer
├─ gamepacks/
│  └─ demo/                # small original pack (no copyrighted data) for dev, tests, onboarding
└─ bench/                  # generated mega-factories (1k / 10k / 50k nodes) + perf harness
```

---

## 4. Data model

### 4.1 Game pack (user-uploadable JSON/YAML)

```yaml
id: satisfactory
name: Satisfactory
version: 1.0.0
units: { rate: per_minute }
plugins: [satisfactory-core]          # optional behaviour plugins
items:
  - { id: iron-ore,   name: Iron Ore,   form: solid, icon: icons/iron-ore.png }
  - { id: iron-ingot, name: Iron Ingot, form: solid }
  - { id: water,      name: Water,      form: fluid }
buildings:
  - id: smelter
    name: Smelter
    power: { consume: 4 }             # MW
    fields: { clock: { min: 1, max: 250, default: 100 } }   # interpreted by plugin
recipes:
  - id: iron-ingot
    building: smelter
    time: 2                            # seconds per craft
    in:  { iron-ore: 1 }
    out: { iron-ingot: 1 }
  - id: alt-pure-iron-ingot
    building: refinery
    time: 12
    in:  { iron-ore: 7, water: 4 }
    out: { iron-ingot: 13 }
    tags: [alternate]
logistics:
  - { id: belt-mk1, carries: solid, capacity: 60 }
  - { id: pipe-mk1, carries: fluid, capacity: 300 }
resources:
  - { id: iron-ore, extractors: [miner-mk1, miner-mk2], nodes: { impure: 39, normal: 42, pure: 46 } }
theme: { accent: "#f5a623" }           # packs may tint the UI
```

- Validation uses zod and shows readable errors with the YAML line and column.
- Packs are content-addressed (hash). Documents record which pack hash and plugin versions they were solved with.
- **Licensing:** we ship only the original demo pack. The Satisfactory and Factorio packs are produced by **importers** that read data from the user's own installation (`CommunityResources/Docs/*.json` for Satisfactory and `factorio --dump-data` for Factorio), so we never redistribute game assets.

### 4.2 Document

- Contains nodes (recipe, source, sink, splitter/merger, bus, subgraph instance, note, group frame), edges (with item, logistics tier, optional fixed split ratio), subgraph definitions (reusable "blueprints"), and per-node plugin fields such as clock or modules.
- The schema is versioned and loading runs through a migration chain.
- Node positions are stored separately from the logical graph, so moving nodes never triggers a re-solve.

### 4.3 Solver IR (the contract between TS and Rust)

The IR is compact and indexed: items, nodes and edges are `u32` indices into flat arrays. It is built by the engine from the document, the pack and plugin output.

```
Node     { kind, rates: SparseVec<item, f64>, pins: Pin[], cost: f64[] }
Edge     { from, to, item, cap: Option<f64>, ratio: Option<f64> }
Extra    { linear constraints & variables contributed by plugins }
Macro    { compiled subgraph summary: modes: SparseVec[], cap: Option<f64> }
Objective{ lexicographic tiers of weighted terms }
```

---

## 5. Solver design (Rust → WASM)

### 5.1 LP formulation

Variables are machine count `x_n ≥ 0` (continuous) for each production node, flow `f_e ≥ 0` for each edge, and slack `s⁺`/`s⁻` for each (node, item) port.

- **Production node**, output item *i*: `Σ f_out(n,i) + surplus(n,i) = x_n · r_out(n,i)`
- **Production node**, input item *i*: `Σ f_in(n,i) + deficit(n,i) = x_n · r_in(n,i)`
- **Logistics** (splitter, merger, bus): flow in equals flow out per item. Split ratios are optional.
- **Edges**: `f_e ≤ cap_e`. This is a soft constraint with overflow slack, so the UI can show *where* a belt is overloaded.
- **Sources**: `Σ out ≤ supply`, for example the resource-node purity multiplied by the extractor rate.
- **Pins**: a user-fixed machine count or output target becomes an equality constraint.
- **Objective tiers**, solved one after another so the results stay numerically stable: (1) meet pinned targets, (2) minimize deficits and overflow, (3) minimize user-weighted cost (raw resources, power, building count). Propagate mode is the case where most variables are pinned.

The LP handles **cycles** (recycling loops, water loops, Factorio quality recycling) natively, which simple propagation cannot do. Probabilistic outputs (quality, byproduct chances) are modelled as expected values, so they stay linear.

### 5.2 Readable results

- Values are rationalized after the solve using continued fractions. The UI can then show `2/3` and `66.6667%`, and split counts as "4 × 100% + 1 × 37.5%".
- **Diagnostics:** every non-zero slack maps to a concrete UI annotation, such as "−12.5/min Iron Plate", "belt over capacity by 15/min" or "unused byproduct".

### 5.3 Performance strategy

1. **Off-thread:** the engine worker keeps a mirror of the document and receives Immer patches, not full snapshots. A solve generation counter cancels or drops stale results.
2. **Decomposition:** the graph is split into weakly connected components, and only *dirty* components are re-solved. Results are cached under a `blake3` hash of each component's IR.
3. **Hierarchy (subgraphs)**, the main scaling lever (see §6).
4. **Results do not go through React Flow.** Solve output is written into typed arrays in a result store. Each node component subscribes only to its own slot via `useSyncExternalStore`, so a solve re-renders only the nodes whose numbers changed.
5. **Budgets checked in CI** (`bench/`): edit → numbers on screen in under 16 ms for a 500-node component and under 150 ms for a 10k-node flat graph; with subgraphs, a 50k-node factory updates in under 50 ms.

---

## 6. Subgraphs (hierarchical pre-computation)

A subgraph is a reusable **blueprint** with typed boundary ports (inputs and outputs). An **instance** places that blueprint in a parent graph.

**Compile (bottom-up, cached by content hash):**
- The feasible set of boundary flows is the projection of the subgraph's internal LP onto its ports.
- **1 degree of freedom** (the common case: a module designed around a ratio): the result is one **macro recipe** `v` plus an optional capacity `t_max` (from fixed machine counts or belt limits). The instance then behaves exactly like a normal recipe node with a scale factor.
- **A few degrees of freedom** (≤ about 4, for example a module with a byproduct choice): extreme points are enumerated with directional LPs, giving a *multi-mode* macro node. The parent LP chooses a non-negative combination of the modes.
- **Otherwise:** the subgraph falls back to *inline*, meaning it is flattened into the parent LP. This is still correct, just slower, and the UI shows a hint suggesting the user add pins.

**Expand (top-down, lazy):** when the user opens a subgraph, its internal LP is solved with the boundary flows fixed by the parent solution. This is cheap and runs only for what is on screen.

**Reuse:** all instances of a blueprint share one compiled summary. Editing the blueprint invalidates that one cache entry.

**UX:** select nodes and press `Ctrl+G` to collapse them into a subgraph (ports are inferred from the edges that cross the selection). Double-click a subgraph to zoom into it with breadcrumb navigation. Blueprints live in a library panel and can be dragged into any graph.

---

## 7. Plugin system

There are two layers.

**Data plugins (declarative):** game packs, plus declared node fields such as `clock`, `modules` or `somersloops`. Their inspector UI is rendered automatically from field descriptors (slider, stepper, enum, item-slot picker).

**Behaviour plugins (code):** ESM modules that run *inside the engine worker*. They have no DOM access and see only the plugin API. Installing a third-party plugin requires an explicit trust confirmation.

```ts
export default definePlugin({
  id: 'satisfactory-core',
  nodeFields: {
    clock:       { kind: 'number', min: 1, max: 250, step: 0.0001, unit: '%', default: 100 },
    somersloops: { kind: 'int', min: 0, max: (b) => b.slots.amplifier ?? 0 },
  },
  // pre-solve: linear transform of the recipe for this node (keeps the LP linear)
  effectiveRecipe(node, recipe, ctx) {
    const clock = node.fields.clock / 100;
    const amp = 1 + node.fields.somersloops / node.building.slots.amplifier;
    return recipe.scaleRates(clock).scaleOutputs(amp);
  },
  // add global linear constraints / variables (e.g. total somersloop budget, power grid balance)
  constraints(ir, ctx) { ir.addConstraint(sum(ir.nodes, n => n.fields.somersloops), '<=', ctx.save.somersloops); },
  // filter recipe availability (alternate unlocks, tech tree)
  recipeAvailable(recipe, ctx) { return !recipe.tags.includes('alternate') || ctx.save.unlocked.has(recipe.id); },
  // post-solve derived metrics (non-linear allowed here)
  derive(node, sol) { return { powerMW: node.building.power.consume * (node.fields.clock / 100) ** 1.321928 * sol.machines }; },
  // validators → badges/warnings on nodes
  validate(node, sol) { /* … */ },
  // UI contributions (declarative): panels, commands, node badges, custom node kinds
  contributes: { commands: [...], panels: [...], nodeKinds: [...] },
});
```

How the reference mechanics map onto the plugin hooks:

| Mechanic | How it's expressed |
|---|---|
| Satisfactory alternate recipes | `recipeAvailable` + a "Save profile" panel with the unlocked set |
| Overclocking, power shards | `effectiveRecipe` (rates) + `derive` (power curve) + `constraints` (shard budget) |
| Somersloops | `effectiveRecipe` (output multiplier) + `constraints` (global budget) |
| Factorio modules and beacons | `nodeFields` (slots) + `effectiveRecipe` (speed/productivity/consumption) |
| Factorio heat (nuclear) | heat becomes a flow item (MW) along heat-pipe edges. A custom `reactor` node kind applies the neighbour bonus from its layout field |
| Fluid temperatures | item *variants* (`steam@500`), generated by the plugin |
| Factorio quality | item variants per tier + recycler recipes with expected-value outputs (cycles handled by the LP) |

---

## 8. UX & visual design

**Aesthetic: "industrial blueprint, at night."** A graphite canvas with a subtle dot grid, glassy panels, and one warm accent colour per game pack. Inter is used for UI text and JetBrains Mono (tabular numbers) for every rate.

**Flows as the hero visual**
- Edge thickness is proportional to the log of throughput. Animated particles travel along edges, and their speed and density encode the rate. Animation is turned off automatically when zoomed out or when the user prefers reduced motion.
- Saturation colours: teal means healthy, amber means more than 90% of belt capacity, red means over capacity or a deficit. A colour-blind-safe palette is available as an option.
- An optional **bottleneck heatmap** overlay and a **Sankey** overview mode give a whole-factory view.

**Nodes**
- Each card shows the building icon and the recipe, with input and output ports that carry the item icon and the live rate. The machine count is shown as "4 × 100% + 1 × 37.5%", with an efficiency ring and an inline clock scrubber.
- **Level of detail** has three tiers: the full card when zoomed in, a compact card with icon and count, and a coloured chip at overview zoom. This keeps a large number of nodes smooth.

**Interactions that make or break it**
- Dragging from a port into empty space opens a **recipe picker filtered by that item**, with producers or consumers depending on port direction. It is ranked by how often you use each recipe and lets you preview alternates side by side.
- A **command palette** (`Ctrl+K`) covers every action. You can quick-add nodes by typing "iron plate".
- Auto-layout runs on the whole graph or the selection, with animated transitions. Alignment guides, snapping, and box or lasso selection are included.
- **Collapse to subgraph** (`Ctrl+G`), zoom-into transitions and breadcrumbs.
- **Goal planner:** pick target outputs and rates, and the app generates the whole chain from the Optimize-mode LP, then lays it out.
- **Inspector** side panel shows the plugin fields, per-item breakdowns and "what-if" recipe swaps with delta previews.
- A **Totals dashboard** shows raw resources against map limits, power, building counts and build cost.
- Undo and redo come with a history panel. The app supports multiple document tabs, autosave and share links.
- First run opens the demo pack with an interactive onboarding tour.

**Accessibility:** full keyboard navigation (move between nodes and ports), focus rings, ARIA on panels, and reduced-motion support.

**Visual QA loop:** Playwright screenshot tests run on a set of canonical scenes (empty state, 20-node chain, a congested graph, inside a subgraph, dark and light themes). Agents check their UI work against these screenshots before merging.

---

## 9. Delivery plan (parallel agents)

The work is split into waves. Each wave fans out to sub-agents in isolated git worktrees, each with a narrow brief and a Definition of Done (tests green, screenshots attached, benchmarks within budget). I act as integrator: I merge each worktree into `claude/dreamy-knuth-362jms`, resolve conflicts, and run review agents (correctness, visual, performance) before each merge.

### Wave 0 — Foundations & contracts (sequential, me)
- Monorepo scaffold (pnpm + Cargo workspaces), Biome, CI (lint, typecheck, test, wasm build, Playwright).
- `packages/schema`: zod `GamePack` and `Document` v1, plus JSON Schema output.
- `crates/solver` IR types + `tsify` TS bindings; `packages/plugin-api` types.
- `gamepacks/demo` (about 15 items and 12 recipes, including a loop and a byproduct).
- Design tokens + an empty app shell that renders a React Flow canvas.
- **Exit criteria:** `pnpm dev` shows the shell, `cargo test` passes, and CI is green. The contracts are frozen.

### Wave 1 — Core vertical slice (5 agents in parallel)
| Agent | Scope | Done when |
|---|---|---|
| **Solver** | LP builder, tiered objectives, slack diagnostics, component decomposition + hash cache, WASM bindings, worker + Comlink bridge | proptest conservation invariants hold; solves the demo-pack scenes; 10k-node bench within budget |
| **Canvas** | `CanvasAdapter`, recipe/source/sink/splitter node components, ports, flow edges with particles, LOD tiers, drag-to-picker | Storybook-style scene screenshots approved; 60 fps pan with 1k nodes |
| **Shell & design system** | tokens, panels, inspector framework (field-descriptor renderer), command palette, toasts, theming | screenshot suite passes in dark and light; keyboard-navigable |
| **Game data** | pack loader (JSON/YAML), validation error UI, Satisfactory `Docs.json` importer, Factorio `data-raw` importer, icon pipeline | real data imports cleanly; schema fixtures tested |
| **Document** | store, Immer patches → undo/redo + worker sync, IndexedDB autosave, `.carbonara` file I/O, migrations | round-trip and undo property tests pass |

**Milestone M1 "It flows":** on the demo pack, place nodes, connect them, and see live rates, deficits and belt saturation.

### Wave 2 — Depth (4 agents in parallel)
| Agent | Scope |
|---|---|
| **Subgraphs** | macro-recipe compiler (1-DOF, multi-mode, inline fallback), collapse/expand UX, breadcrumbs, blueprint library |
| **Plugins** | plugin host in the worker, hook pipeline, trust UI, `satisfactory` + `factorio` reference plugins |
| **Planner** | Optimize mode, goal planner → generated graph, ELK auto-layout worker, Totals dashboard, Sankey view |
| **Desktop & perf** | Tauri 2 shell (file associations, native dialogs, menus, updater), bench harness in CI, perf profiling pass |

**Milestone M2 "It's a game":** Satisfactory import works with alternates, overclock and somersloops. **M3 "Megafactory":** a 50k-node factory built from subgraphs stays interactive, and the Factorio pack with modules, beacons and quality works.

### Wave 3 — Polish (2–3 agents + review)
Onboarding tour, empty states, micro-interactions, a visual QA pass over every scene, an accessibility audit, docs for pack and plugin authors, and release builds (web deploy + Tauri installers).

**Milestone M4 "Ship".**

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| React Flow slows down with very large *visible* graphs | LOD tiers, culling, results kept outside React state, and subgraphs keep the visible count low. The `CanvasAdapter` leaves room for a WebGL renderer |
| Subgraph projection is hard in general | Handle the common cases exactly (1-DOF and a few modes) and flatten the rest, with clear UX hints |
| `microlp` is too slow for huge flat LPs | Solver backend trait with `clarabel` as an alternative; decomposition and hierarchy reduce problem size first |
| Third-party plugin code is a security risk | Plugins run in a worker with no DOM, UI contributions are declarative only, and installing requires an explicit trust prompt |
| Game data licensing | Importers read data from the user's own installation; we ship only the original demo pack |
| Numerical noise ("59.99999/min") | Tiered solves, epsilon cleanup, and rational display |

---

## 11. Explicitly out of scope for v1
Real-time multiplayer (although Immer patches leave a path to Yjs), a map-based resource-node picker, mod managers and mobile layouts.
