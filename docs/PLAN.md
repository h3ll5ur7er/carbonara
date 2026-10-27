# Carbonara — Implementation Plan

A game-agnostic, node-based factory planner. It works in the browser and can be installed as a desktop app via Tauri. Each game is supported by a **game pack**: a single zipped file with a custom extension (`.cpack`). It always contains both the game data (items, recipes, buildings and so on) and the plugin code for that game's mechanics. The solver core is written in Rust and compiled to WASM.

---

## 1. Guiding principles

1. **Everything is a linear flow problem.** Each mechanic (overclocking, modules, beacons, heat, quality, somersloops, alternate recipes) is turned into item flows plus linear constraints *before* the solver runs. Mechanics that are non-linear (for example the Satisfactory power curve) are computed as **derived metrics** after the solve. This keeps the core small, fast and generic, and plugins never need to touch Rust.
2. **One engine, two modes.** *Propagate* mode (Satisfactory-Modeler style: you place machines and see where flows run short or pile up) and *Optimize* mode (you state goals and the app chooses recipes and counts) are the same LP with different pins and objectives.
3. **The UI thread never waits.** Solving, plugin hooks, auto-layout and data-pack parsing all run in workers. The canvas only reads results.
4. **Hierarchy is the scaling strategy.** A subgraph compiles to a "macro recipe". The top level only solves macro nodes, and the inside of a subgraph is solved only when you open it.
5. **Contracts first, then parallel work.** The data-pack schema, document schema, solver IR and plugin API are fixed in Wave 0 so that the later waves can be built in parallel without conflicts.
6. **The AI is just another user.** Every change, whether it comes from the mouse, the command palette, a paste or the MCP server, goes through the same command pipeline. That gives every change undo, a history entry and a ghost preview.

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
| Game packs | `.cpack` = zip read with `fflate` in a worker; plugin code bundled with `esbuild` by our pack CLI | One file to share or install; unzipping never blocks the UI |
| Schemas | `zod` for pack manifests, pack data and documents (with JSON Schema generated for external authors). Solver IR is defined in Rust with TS types generated via `tsify` | Each layer has one source of truth |
| Layout | ELK.js (layered) in a worker | Good automatic layout for left-to-right production chains |
| Persistence | IndexedDB (Dexie) autosave; `.carbonara` files (gzipped JSON); share links | Works offline, and documents are portable |
| Desktop | Tauri 2 (same web bundle, native file I/O, menus, file associations, auto-update) | Little extra code needed |
| MCP server | `rmcp` (official Rust MCP SDK) inside the Tauri app: Streamable HTTP on localhost, plus a stdio bridge | Works with Claude Desktop, Claude Code and any other MCP client |
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
│  ├─ solver-wasm/         # wasm-bindgen bindings, postcard decode/encode
│  └─ mcp/                 # MCP server (rmcp): tools, resources, prompts, IPC bridge to the engine
├─ packages/
│  ├─ schema/              # zod: PackManifest, PackData, Document, migrations; emits JSON Schema
│  ├─ engine/              # pack loader, doc→IR compiler, plugin host, solver worker, result store
│  ├─ canvas/              # CanvasAdapter + React Flow implementation, node/edge components
│  ├─ ui/                  # design system: tokens, primitives, icons, panels
│  ├─ plugin-api/          # public types + definePlugin() for pack authors
│  └─ pack-cli/            # `carbonara-pack`: validate, bundle plugin, zip → .cpack, dev watch
├─ packs/                  # each folder builds into one .cpack (data + icons + plugin together)
│  ├─ _template/           # small original example pack: scaffold for `carbonara-pack new`, test fixture
│  ├─ satisfactory/        # full data + icons; clock speed, somersloops, alternates, power curve
│  └─ factorio/            # full data + icons; modules, beacons, quality, heat, fluid temps
└─ bench/                  # generated mega-factories (1k / 10k / 50k nodes) + perf harness
```

---

## 4. Data model

### 4.1 Game pack (`.cpack`)

A game pack is the single unit that adds a game to Carbonara. Data and plugin code always ship together: a document references exactly one pack, and the pack's plugin can rely on its own data being there. Nothing gets installed without the other half.

```
satisfactory.cpack              # zip archive, custom extension
├─ manifest.yaml                # identity, versions, entry points, hash
├─ data/                        # JSON or YAML, split into as many files as you like
│  ├─ items.yaml
│  ├─ buildings.yaml
│  ├─ recipes.yaml
│  ├─ logistics.yaml
│  └─ resources.yaml
├─ plugin/
│  └─ index.js                  # bundled ESM: definePlugin({...}), see §7
├─ icons/                       # PNG/SVG/WebP referenced from data
├─ locales/                     # optional: en.yaml, de.yaml … for item/recipe names
├─ CREDITS.md                   # asset sources, permissions, attribution
└─ README.md                    # shown in the pack manager
```

```yaml
# manifest.yaml
id: satisfactory
name: Satisfactory
version: 1.2.0                   # pack version (semver)
engine: ^1                       # plugin API / schema version this pack targets
game: { name: Satisfactory, version: "1.1" }
data: data/                      # all files here are merged in order
plugin: plugin/index.js          # required; the template ships a no-op plugin
theme: { accent: "#f5a623" }     # packs may tint the UI
```

```yaml
# data/*.yaml (merged)
units: { rate: per_minute }
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
  - { id: belt-mk1, name: Conveyor Belt Mk.1, aliases: [mk1 belt], carries: solid, capacity: 60 }  # aliases help the MCP tools understand plain language
  - { id: pipe-mk1, carries: fluid, capacity: 300 }
resources:
  - { id: iron-ore, extractors: [miner-mk1, miner-mk2], nodes: { impure: 39, normal: 42, pure: 46 } }
```

- **Built-in packs:** the app ships with every pack we maintain (Satisfactory and Factorio to start). They're built from `packs/*` at app build time, come preinstalled and trusted, and update with the app. They can also be updated on their own, without a new app release.
- **Loading third-party packs:** you drop a `.cpack` on the app, open it via a file dialog, or double-click it on desktop (Tauri file association). The engine worker unzips it, validates the manifest and data with zod, and checks that the `engine` range is compatible. Readable errors give the file name plus the YAML line and column. Because the pack contains code, installing it shows a trust prompt (see §7). Installed packs are stored in IndexedDB/OPFS (web) or the app data folder (desktop).
- **Identity:** a pack is content-addressed (a hash of the whole archive). Documents record pack id, version and hash. Opening a document whose pack is missing or a different version offers to install or migrate.
- **Authoring:** `carbonara-pack new` scaffolds a new pack from `packs/_template`, a small original example game with a no-op plugin. The same CLI (in `packages/pack-cli`) validates the pack, bundles the plugin's TypeScript with esbuild, and zips it into a `.cpack`. **Dev mode** loads an unpacked pack folder and hot-reloads it when files change. On the web this uses the File System Access API; on desktop it watches the folder.
- **Data & icons:** every pack bundles its full data and icons, so there are no install-path lookups at runtime. For maintainers, the pack's **importer** hook (run with `carbonara-pack import satisfactory --from <Docs.json>`) regenerates `data/` when a game updates. Icons are sourced once, normalized to WebP at fixed sizes by the icon pipeline, and recorded in the pack's `CREDITS.md`.
- **Permission to use assets:** before we publish a build that includes a game's pack, we get the publisher's OK or confirm their fan-content policy covers it, and record the result in `CREDITS.md`. Each pack is a separate, removable unit, so a takedown request affects only that game's pack.
- **v1 scope:** one pack per document. Mod packs that extend a base pack (`extends: factorio`) are a later addition, and the manifest leaves room for it.

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

Every game pack has exactly one plugin (`plugin/index.js` inside the `.cpack`), and that plugin works with the pack's own data. A game with no special mechanics uses the template's no-op plugin.

**Declarative parts:** node fields such as `clock`, `modules` or `somersloops`. Their inspector UI is rendered automatically from field descriptors (slider, stepper, enum, item-slot picker), so most packs need no UI code.

**Code (hooks):** the plugin is an ESM module that runs *inside the engine worker*. It has no DOM access and sees only the plugin API. Because every pack contains code, installing a pack that isn't built in requires an explicit trust confirmation, which shows the pack's id, version and hash.

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
  // optional, maintainer tooling: regenerate data/ from the game's own data files (see §4.1)
  importer: { accepts: ['Docs.json', 'en-US.json'], run(files, ctx) { /* → { data, icons } */ } },
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
- Auto-arrange, alignment, copy/paste with a ghost preview and the other quality-of-life features are described in §9.
- **Collapse to subgraph** (`Ctrl+G`), zoom-into transitions and breadcrumbs.
- **Goal planner:** pick target outputs and rates, and the app generates the whole chain from the Optimize-mode LP, then lays it out.
- **Inspector** side panel shows the plugin fields, per-item breakdowns and "what-if" recipe swaps with delta previews.
- A **Totals dashboard** shows raw resources against map limits, power, building counts and build cost.
- Undo and redo come with a history panel. The app supports multiple document tabs, autosave and share links.
- First run asks which game you're playing and opens a starter factory for it, with an interactive onboarding tour.

**Accessibility:** full keyboard navigation (move between nodes and ports), focus rings, ARIA on panels, and reduced-motion support.

**Visual QA loop:** Playwright screenshot tests run on a set of canonical scenes (empty state, 20-node chain, a congested graph, inside a subgraph, dark and light themes). Agents check their UI work against these screenshots before merging.

---

## 9. Editor quality-of-life

These features decide whether the editor feels pleasant during a long session. They're first-class scope, not polish.

**Layout & alignment**
- **Auto-arrange** the whole graph or the selection, left → right (default) or top → bottom. It uses ELK layered layout with ordering that is aware of item flow, to keep edge crossings low, and animates to the new positions. Pinned or locked nodes stay where they are.
- **Align** left, centre, right, top, middle or bottom. **Distribute** horizontally or vertically. **Straighten chain** lines a linear chain up on one row.
- Snap to grid (hold `Alt` to bypass), smart alignment guides with spacing indicators, and arrow-key nudging (`Shift` for big steps).
- Edge styles (orthogonal or smooth), reroute points (double-click an edge), and bundled edges for main buses.

**Clipboard & ghost placement**
- Copy, cut, paste and duplicate (`Ctrl+C/X/V/D`). Paste doesn't drop nodes immediately; it shows a **ghost**, a translucent copy that follows the cursor with live snapping and guides. Click to place, `Esc` to cancel.
- Edges inside the selection are kept. **Paste with connections** (`Ctrl+Shift+V`) reconnects edges to the original outside nodes when pasting into the same document.
- Works across documents and into or out of subgraphs. The clipboard also holds plain text (JSON), so you can paste a setup into Discord and someone else can paste it back. Pasting between different packs warns about ids that don't exist.
- The same ghost renderer is used for blueprints dragged from the library and for MCP proposals (§10).

**Editing**
- Drop a node onto an edge to insert it. **Delete & bridge** (`Ctrl+Shift+Del`) removes a node and keeps the flow connected. `Alt`-drag the end of an edge to move it to another port.
- **Multi-select editing:** change the recipe, clock, modules or belt tier on every selected node at once.
- **Find** (`Ctrl+F`) items, recipes and nodes across the whole factory, including inside subgraphs, and jump to them. **Replace recipe everywhere.**
- **Balance** actions: fit a node's machine count to downstream demand or upstream supply. **Round to buildable** switches between "4 × 100% + 1 × 37.5%" and "5 × 87.5%".
- Lock nodes, group frames (colour, label, collapsible), sticky notes and colour tags.
- Choose the unit per document: /s, /min, /h, or **belts** ("2.0 × Mk.3 belt").

**Navigation**
- Zoom to fit or to the selection (`F` / `Shift+F`), minimap, viewport bookmarks (`Ctrl+1…9`), breadcrumbs, and back/forward like a browser.
- Hover tooltips break a port's rate down by connection. Holding `Alt` while hovering highlights the node's whole upstream and downstream chain.

**General**
- Context menus everywhere, customizable shortcuts with a cheat sheet (`?`), export to PNG/SVG, and autosave.

---

## 10. MCP server (desktop)

The desktop app runs an MCP server, so any MCP client (Claude Desktop, Claude Code and others) can read and edit your factories and help you build packs. The aim is that "create a steel smelting setup that produces 2 full yellow belts" just works.

**Architecture**
- The server runs inside the Tauri app (Rust, `rmcp`) and serves Streamable HTTP on `127.0.0.1` with a per-install token. `carbonara mcp` is a stdio bridge in the same binary, for clients that only launch stdio servers. A settings panel offers one-click "copy config" snippets for common clients.
- Tool calls are forwarded over Tauri IPC to the engine worker in the webview. The engine stays the single source of truth because pack plugins are JS. If the app isn't running, tools return a clear error.
- **Edits go through the normal command pipeline:** each tool call becomes one undo step, labelled "AI: …" in the history panel.
- **Proposals instead of surprises:** generative tools don't change the document directly by default. They create a **proposal**, shown as a ghost overlay with a summary card (machines, raw inputs, power) and *Accept*, *Adjust* and *Discard* buttons. A setting allows edits to be applied directly instead.
- **Permissions:** tools are read-only by default. The *Edit* and *Pack authoring* groups are switched on separately in settings. An activity panel lists every call.

**Initial tools**

| Group | Tools |
|---|---|
| Read | `list_packs`, `search_catalog` (items/recipes/buildings), `get_recipe`, `list_documents`, `get_graph` (document, subgraph or selection; summarized for large graphs), `get_totals`, `get_diagnostics` (deficits, overloaded belts, byproducts), `explain_node` |
| Plan | `convert_rate` ("2 full yellow belts" → items/min, using the pack's logistics data and aliases), `plan_production(targets, options)` → proposal, `compare_recipes(item, rate)` |
| Edit | `add_nodes`, `connect`, `set_node_fields`, `replace_recipe`, `create_subgraph`, `auto_arrange`, `apply_proposal`, `undo` |
| Pack authoring | `get_pack_schema`, `get_plugin_api_docs`, `scaffold_pack`, `read_pack_file` / `write_pack_file` (only inside a dev pack folder), `validate_pack`, `reload_dev_pack`, `build_cpack` |

**Resources:** JSON Schemas, the plugin API reference, and a summary of the active document. **Prompts:** "Design a production line" and "Create a pack for <game>".

**Example flow.** "Steel, 2 full yellow belts" → `convert_rate` (yellow belt = 15/s in the Factorio pack, so 30/s = 1800/min) → `plan_production({steel-plate: 1800/min})` → a ghost proposal appears next to your existing factory with "480 steel furnaces (240 smelting iron plate, 240 making steel), 9000 iron ore/min" → you click *Accept* → `auto_arrange` tidies it.

**Web version:** browsers can't host an MCP server, so the web app has no MCP in v1. A companion relay is a possible later addition.

---

## 11. Delivery plan (parallel agents)

The work is split into waves. Each wave fans out to sub-agents in isolated git worktrees, each with a narrow brief and a Definition of Done (tests green, screenshots attached, benchmarks within budget). I act as integrator: I merge each worktree into `claude/dreamy-knuth-362jms`, resolve conflicts, and run review agents (correctness, visual, performance) before each merge.

### Wave 0 — Foundations & contracts (sequential, me)
- Monorepo scaffold (pnpm + Cargo workspaces), Biome, CI (lint, typecheck, test, wasm build, Playwright).
- `packages/schema`: zod `PackManifest`, `PackData` and `Document` v1, plus JSON Schema output.
- `crates/solver` IR types + `tsify` TS bindings; `packages/plugin-api` types.
- `packs/_template` (an original example game with about 15 items and 12 recipes, including a loop and a byproduct, with a no-op plugin), plus a minimal `pack-cli build` that zips it into a `.cpack`. It is the pack-author template and the test fixture.
- Design tokens + an empty app shell that renders a React Flow canvas.
- **Exit criteria:** `pnpm dev` shows the shell, `cargo test` passes, and CI is green. The contracts are frozen.

### Wave 1 — Core vertical slice (5 agents in parallel)
| Agent | Scope | Done when |
|---|---|---|
| **Solver** | LP builder, tiered objectives, slack diagnostics, component decomposition + hash cache, WASM bindings, worker + Comlink bridge | proptest conservation invariants hold; solves the template-pack and built-in pack scenes; 10k-node bench within budget |
| **Canvas** | `CanvasAdapter`, recipe/source/sink/splitter node components, ports, flow edges with particles, LOD tiers, drag-to-picker, selection, snapping, guides, nudge, zoom-to-fit | Storybook-style scene screenshots approved; 60 fps pan with 1k nodes |
| **Shell & design system** | tokens, panels, inspector framework (field-descriptor renderer), command palette, toasts, theming | screenshot suite passes in dark and light; keyboard-navigable |
| **Game packs** | `.cpack` loader (unzip, manifest + data validation, engine-range check), validation error UI, pack manager panel, `pack-cli` (scaffold, validate, bundle, zip, dev watch, import), Satisfactory `Docs.json` + Factorio `data-raw` importers, icon sourcing + WebP pipeline, built-in pack bundling into the app build | `satisfactory.cpack` and `factorio.cpack` build with full data and icons and load in the app; schema fixtures and malformed-archive tests pass |
| **Document** | store, Immer patches → undo/redo + worker sync, IndexedDB autosave, `.carbonara` file I/O, migrations | round-trip and undo property tests pass |

**Milestone M1 "It flows":** with a built-in pack, place nodes, connect them, and see live rates, deficits and belt saturation.

### Wave 2 — Depth (6 agents in parallel)
| Agent | Scope |
|---|---|
| **Subgraphs** | macro-recipe compiler (1-DOF, multi-mode, inline fallback), collapse/expand UX, breadcrumbs, blueprint library |
| **Plugins** | plugin host in the worker, hook pipeline, trust UI, plugins for the `satisfactory` + `factorio` packs |
| **Planner** | Optimize mode, goal planner → proposal (ghost) → generated graph, Totals dashboard, Sankey view |
| **Editor QoL** | everything in §9: ELK auto-arrange worker (the Planner uses it too), align/distribute, clipboard + ghost renderer, insert-on-edge, delete & bridge, multi-select editing, find/replace, balance actions, frames/notes, bookmarks, shortcut editor |
| **Desktop & perf** | Tauri 2 shell (file associations for `.carbonara` and `.cpack`, native dialogs, menus, updater), bench harness in CI, perf profiling pass |
| **MCP** | `crates/mcp` (rmcp server, token auth, stdio bridge), IPC bridge to the engine, the tools and resources from §10, permission settings + activity panel, proposal flow. Tested with a scripted MCP client and an end-to-end "2 yellow belts of steel" scenario. Lands on top of the Desktop shell |

**Milestone M2 "It's a game":** the bundled Satisfactory pack works with alternates, overclock and somersloops, and an MCP client can plan a line into the open document as a proposal. **M3 "Megafactory":** a 50k-node factory built from subgraphs stays interactive, and the Factorio pack with modules, beacons and quality works.

### Wave 3 — Polish (2–3 agents + review)
Onboarding tour, empty states, micro-interactions, a visual QA pass over every scene, an accessibility audit, docs for pack and plugin authors, and release builds (web deploy + Tauri installers).

**Milestone M4 "Ship".**

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| React Flow slows down with very large *visible* graphs | LOD tiers, culling, results kept outside React state, and subgraphs keep the visible count low. The `CanvasAdapter` leaves room for a WebGL renderer |
| Subgraph projection is hard in general | Handle the common cases exactly (1-DOF and a few modes) and flatten the rest, with clear UX hints |
| `microlp` is too slow for huge flat LPs | Solver backend trait with `clarabel` as an alternative; decomposition and hierarchy reduce problem size first |
| Third-party pack code is a security risk | Plugins run in a worker with no DOM, UI contributions are declarative only, and installing a pack requires an explicit trust prompt showing its hash. Signed packs can come later |
| A pack update breaks existing documents | Documents pin pack id + version + hash; the `engine` range is checked on load; data id changes go through pack-provided migrations |
| Game data and icon licensing | Publisher permission or a covering fan-content policy before publishing; sources and permissions in each pack's `CREDITS.md`; packs are separate units that can be pulled individually |
| A local MCP server opens a door into the app | Bound to `127.0.0.1` only, per-install token, read-only by default, separate opt-in for edit and authoring tools, file writes limited to dev pack folders, every call logged and undoable |
| Numerical noise ("59.99999/min") | Tiered solves, epsilon cleanup, and rational display |

---

## 13. Explicitly out of scope for v1
Real-time multiplayer (although Immer patches leave a path to Yjs), a map-based resource-node picker, mod managers, mobile layouts, MCP in the web version, and a built-in chat assistant (external MCP clients cover this for now).
