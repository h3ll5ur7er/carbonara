# Design

Carbonara should feel like a precision instrument: calm, fast and legible at any zoom level, with the factory's flows as the hero visual.

[TOC]

## Aesthetic: "industrial blueprint, at night"

- A graphite canvas with a subtle dot grid, glassy panels, and one warm accent colour per game pack (the pack's `theme.accent`).
- Inter for UI text, JetBrains Mono with tabular figures for every rate.
- Dark first, with a light theme of equal quality. All colours, spacing, radii and motion durations are design tokens (CSS variables); components never use raw values.

## Tokens

The tokens live in `src/client/ui/tokens.css` and reach components as Tailwind utilities (`bg-surface-2`, `text-fg-muted`, `rounded-md`, `shadow-panel`). Tailwind's stock palette is removed, so only token colours exist.

| Group | Tokens |
| --- | --- |
| Surfaces, by elevation | `canvas`, `surface-1` (chrome) to `surface-4` (pressed), `glass` (translucent panels, with `backdrop-blur-glass`) |
| Text | `fg`, `fg-muted`, `fg-subtle`, `fg-faint`, `on-accent` |
| Lines and grid | `line-subtle`, `line`, `line-strong`; `grid-dot`, `grid-dot-major` |
| Accent | `accent`, `accent-hover`, `accent-fg` (legible as text), `accent-soft`, `accent-glow` |
| Flows | `flow-healthy` (teal), `flow-near-capacity` (amber), `flow-over-capacity` (red) |
| Type | `font-sans` (Inter), `font-mono` (JetBrains Mono, tabular figures); sizes `2xs` (11 px) to `3xl` (32 px) |
| Shape and depth | 4 px spacing step, radii `xs`–`xl`, shadows `sm`, `panel`, `overlay` |
| Motion | `--duration-instant` to `--duration-slow` (0 with reduced motion), easings `out` and `in-out` |

- **Themes:** each colour is written once as `light-dark(light, dark)`, so a theme only sets `color-scheme`. Dark is the default; `data-theme="light"` or `"dark"` on `<html>` is an explicit choice, and without one the theme follows `prefers-color-scheme`.
- **Pack accent:** a pack sets `--pack-accent` (its `theme.accent`) on `<html>` or on any subtree. The accent tokens are derived from it where they're used (`@theme inline`), so they follow it without being redefined.
- **Colour-blind palette:** `data-palette="colorblind"` on `<html>` swaps the flow colours for Okabe–Ito blue, yellow and vermillion, which also differ in lightness.
- **Fonts** are bundled with the app (`@fontsource-variable`), never loaded from the network, so screenshots are deterministic and the app works offline.
- The canvas dot grid has a dot every 24 flow units and a brighter one every fourth, with dots centred on multiples of the pitch.

## Flows as the hero visual

- Edge thickness grows with the log of throughput. Animated particles travel along edges, and their speed and density encode the rate. Animation turns off automatically when zoomed out or when the user prefers reduced motion.
- Saturation colours: teal means healthy, amber means more than 90% of belt capacity, red means over capacity or a deficit. A colour-blind-safe palette is available as an option.
- An optional **bottleneck heatmap** overlay and a **Sankey** overview mode give a whole-factory view.

## Nodes

- Each card shows the building icon and the recipe, with input and output ports that carry the item icon and the live rate. The machine count reads "4 × 100% + 1 × 37.5%", with an efficiency ring and an inline clock scrubber.
- **Level of detail** has three tiers: the full card when zoomed in, a compact card (icon and count) in between, and a coloured chip at overview zoom. This keeps large graphs smooth.

### Anatomy

| Kind | Shape | Shows |
| --- | --- | --- |
| Recipe | Card, 13 grid units wide | Header: building tile (monogram on the accent), recipe name (with an `Alt` badge for alternates), building name, efficiency ring with the machine count. A strip with the machine groups ("2 × 100% + 1 × 50%"; later the clock scrubber). Then one row per port: inputs first with their port on the left edge, outputs below a hairline with their port on the right edge. Each row: item chip, item name, live rate |
| Source / sink | Pill, so the silhouette alone sets them apart from machines | Item chip, item name, rate; a source adds its limit, a sink a progress bar towards its target |
| Junction | Circle | The chip of the item it carries, its throughput below |
| Note | Sticky card with an accent edge | The text |
| Frame | Dashed, tinted area behind everything | Its label |

- **Geometry is fixed** per node kind and port count ([[src/client/canvas/model/geometry.ts]]), so ports, and so edges, sit in the same place at every level of detail and in any renderer, and edges of nodes that were never on screen still have their ends.
- **Item chips** are the fallback for packs without icons, which is every pack today: a monogram (initials of the first two words, or the first two letters of one word) on a tint whose hue is a hash of the item id, so an item looks the same everywhere. Solids are rounded squares, fluids circles, so shape and text carry the meaning, not only colour. The tint variables (`--item-bg`, `--item-fg`, `--item-line`, `--item-wash`) are derived in `src/client/canvas/canvas.css` from `--hue`; ports use the same tint, so a port matches its row's chip.
- **States:** selected nodes get an accent ring; a node short of an input gets an over-capacity ring, and the short port shows a warning triangle next to its rate (colour is never the only signal). Without results, rates read "—" and the strip reads "Not solved yet".
- **Rates** use the document's unit (else the pack's), with about three significant figures ([[src/client/canvas/model/format.ts]], a stand-in until the rational display of [[CARB-13]]).
- **Flows that run backwards** (recycling loops) leave to the right, loop below both nodes with rounded corners and enter from the left, so they never cut through a card.

### How the canvas is built

`Canvas` ([[src/client/canvas/canvas.tsx]]) takes a `Document`, its `PackData` and the latest `AnalysisResults` as props, so it works the same with fixtures and with the read model. It builds a renderer-neutral scene ([[src/client/canvas/model/scene.ts]]: node and edge views with names from the pack and fixed geometry; unchanged nodes keep their view, so their components don't render again) and hands it to the renderer through the `CanvasAdapter` seam ([[src/client/canvas/adapter.ts]]). The renderer reports intents (nodes dropped, ports connected), and `Canvas` turns them into `editing.apply` commands sent through the connector.

Results bypass React state: they go into per-node and per-edge slots ([[src/client/canvas/model/result-slots.ts]]), each node and edge subscribes only to its own slot, and a new solve notifies only the slots whose values changed.

## Core interactions

- Dragging from a port into empty space opens a **recipe picker filtered by that item**, showing producers or consumers depending on the port direction. It's ranked by how often you use each recipe and previews alternates side by side.
- A **command palette** (`Ctrl+K`) reaches every action. Typing "iron plate" quick-adds a node.
- **Collapse to subgraph** (`Ctrl+G`), zoom-into transitions and breadcrumbs ([[Architecture/Subgraphs]]).
- **Goal planner:** pick target outputs and rates; the app proposes the whole chain as a ghost you can accept, adjust or discard.
- **Inspector** side panel: plugin fields, per-item breakdowns, and "what-if" recipe swaps with delta previews.
- **Totals dashboard:** raw resources against map limits, power, building counts and build cost.
- Undo/redo with a history panel; multiple document tabs; autosave; share links.
- First run asks which game you're playing and opens a starter factory for it, with an interactive tour.
- The many smaller conveniences are on [[Design/Editor quality of life]].

## Accessibility

Full keyboard navigation (between nodes and ports), visible focus rings, ARIA on panels, reduced-motion support, and colour never as the only signal.

## Visual QA

Playwright screenshot tests cover a set of canonical scenes: empty state, a 20-node chain, a congested graph, inside a subgraph, the ghost paste, and each in dark and light. UI work is checked against these scenes before it's merged, and an intentional visual change updates the baseline in the same commit.

The canvas scenes are fixtures in `src/client/canvas/scenes/`, built on the template pack (read straight from `packs/_template`). In development, `?scene=<name>` shows one, for example `/?scene=chain`; add `&zoom=1&focus=<node id>` to look at it up close. Edits in a scene go through the real connector and RPC dispatcher to a scene backend that applies them in memory, and that backend lists them in `window.carbonaraScene.commands` for e2e tests. The scene code is left out of production builds.

[SUBPAGES]
