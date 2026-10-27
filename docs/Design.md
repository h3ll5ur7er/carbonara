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

[SUBPAGES]
