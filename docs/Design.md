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
| Status and controls | `danger`, `danger-soft`, `success` (messages, destructive actions); `knob` (switch and slider knobs, light in both themes); `scrim` (behind modal dialogs) |
| Type | `font-sans` (Inter), `font-mono` (JetBrains Mono, tabular figures); sizes `2xs` (11 px) to `3xl` (32 px) |
| Shape and depth | 4 px spacing step, radii `xs`–`xl`, shadows `sm`, `panel`, `overlay`, `knob`; `inset-shadow-well` (recessed fields); blurs `glass`, `scrim` |
| Motion | `--duration-instant` to `--duration-slow` (0 with reduced motion), easings `out` and `in-out`; entrances `animate-pop-in` (popovers), `animate-rise-in` (dialogs, toasts), `animate-fade-in`, `animate-fade-out` |

- **Themes:** each colour is written once as `light-dark(light, dark)`, so a theme only sets `color-scheme`. Dark is the default; `data-theme="light"` or `"dark"` on `<html>` is an explicit choice, and without one the theme follows `prefers-color-scheme`. The choice is held in memory by `ui/use-theme.ts` (shared by the theme toggle and the command palette) until the preferences access component persists it.
- **Pack accent:** a pack sets `--pack-accent` (its `theme.accent`) on `<html>` or on any subtree; `packAccentStyle(accent)` in `ui/theme.ts` gives the style for a subtree. The accent tokens are derived from it where they're used (`@theme inline`), so they follow it without being redefined.
- **Colour-blind palette:** `data-palette="colorblind"` on `<html>` swaps the flow colours for Okabe–Ito blue, yellow and vermillion, which also differ in lightness.
- **Fonts** are bundled with the app (`@fontsource-variable`), never loaded from the network, so screenshots are deterministic and the app works offline.
- The canvas dot grid has a dot every 24 flow units and a brighter one every fourth, with dots centred on multiples of the pitch.

## Primitives

The design system lives in `src/client/ui/`, one file per primitive, built on Radix primitives and styled only with tokens. The `?scene=gallery` scene shows every primitive in its common states and lets you switch the theme and the pack accent; its screenshots and keyboard tests are in `e2e/ui.spec.ts`.

| Primitive | File | Notes |
| --- | --- | --- |
| `Button` | `button.tsx` | Variants `primary` (the one main action), `secondary`, `ghost`, `danger`; sizes `sm` (28 px) and `md` (32 px) |
| `IconButton` | `button.tsx` | Always has a `label` (its accessible name and tooltip) and optionally the shortcut |
| `Input` | `input.tsx` | Fields share `fieldSurface`: a recessed well whose hairline turns accent with a soft halo on focus |
| `NumberInput` | `number-input.tsx` | Tabular figures, a unit suffix and a stepper. Arrow keys nudge by about 1/100 of the range (a power of ten, at least the step), Shift or Page Up/Down by ten times that; Enter or blur commits a typed value (clamped, snapped to the step), Escape reverts. Only committed values leave the field, so each edit is one undo step |
| `Slider` | `slider.tsx` | `onValueChange` follows the drag, `onValueCommit` fires once at the end |
| `Select` | `select.tsx` | For short option lists |
| `Menu…`, `ContextMenu…` | `menu.tsx` | Items with an optional icon and shortcut; the context menu also opens with Shift+F10 or the context-menu key |
| `Tooltip` | `tooltip.tsx` | Opens on hover and keyboard focus; needs one `TooltipProvider` at the root |
| `Dialog` | `dialog.tsx` | Title, optional description, body and a footer with the primary action last; focus is trapped and returns to the trigger |
| `Tabs` | `tabs.tsx` | A segmented control; arrow keys move between tabs |
| `Toggle`, `Switch` | `toggle.tsx` | A pressed/unpressed icon button for toolbars, a switch for on/off settings |
| `Kbd` | `kbd.tsx` | Shows keys already in display form |

Popovers (menus, select lists) float on frosted glass (`popoverSurface`); dialogs sit on a solid surface over a blurred scrim. Number formatting and parsing (decimal comma, units typed after the number, no float noise) live in `number.ts`.

## Shell

The shell ([[src/client/app.tsx]], `src/client/shell/`) is a top bar over a full-bleed canvas, with side panels floating over the canvas on frosted glass and toasts at the bottom centre.

- **Side panels:** the left one (Library, closed by default) and the right one (Inspector, open by default). Each has a close button and a resizable inner edge: drag it, or focus it and use the arrow keys (Shift for bigger steps), Home and End for the limits, Enter to close. The top bar toggles them. Open state and widths live in a session store (`shell/panels.ts`); the limits are in `shell/panel-layout.ts`.
- **Inspector:** renders the selected node's plugin fields from their `FieldDescriptor`s ([[Architecture/Plugins]]), with no plugin UI code. `number` becomes a slider with a stepper and the unit, `choice` a select, `toggle` a switch. A value that is missing, of the wrong kind or out of range shows the default or the nearest allowed value. Each committed edit is one `setNodeFields` command to `editing.apply`, labelled for the undo history ("Set Clock speed to 150 %"); the control keeps the new value until the call returns, and a refused edit shows an error toast. The inspector itself only calls `onFieldEdit`; `InspectorPanel` does the wiring.
- **Commands:** every action is registered once in the command registry ([[src/client/core/commands.ts]]) with an id, a title, a group, an icon and a shortcut; the app's commands are in [[src/client/shell/app-commands.ts]]. The command palette, the app menu (behind the wordmark), the keyboard and the tooltips all read the registry, so a new action needs only a registration. Shortcuts are written as `Mod+Shift+K` (`Mod` is Ctrl, or Cmd on a Mac) and shown in each platform's style; plain-key shortcuts don't fire while a text field has focus. A duplicate id or shortcut throws when the registry is built.

| Command | Shortcut |
| --- | --- |
| Command palette | `Ctrl+K` |
| Toggle library | `Ctrl+B` |
| Toggle inspector | `Ctrl+I` |
| Switch light and dark theme | `Ctrl+Shift+L` |

- **Command palette** (`Ctrl+K`, or the search field in the top bar): type to filter, arrow keys to move, Enter to run, Escape to close. With a document open, typing an item or recipe name also lists **quick-add** entries: every recipe of the document's pack, found by its name, its outputs and their aliases, and its buildings, showing where it runs and what it turns into what. Picking one sends one `addNode` command to `editing.apply` ("Add Iron Plate") and confirms with a toast. Quick-added nodes land at the origin until the canvas can say where the user is looking.
- **Toasts:** `toast({ title, description, tone })` from anywhere in the client; `info` and `success` close after 4 s, `error` after 8 s. At most three show at once. Screen readers announce them and F8 jumps to them.

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
