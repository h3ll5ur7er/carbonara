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
| Motion | `--duration-instant` to `--duration-slow` (0 with reduced motion), easings `out` and `in-out`; entrances `animate-pop-in` (popovers), `animate-rise-in` (dialogs, toasts), `animate-fade-in`, `animate-fade-out`; loops `animate-spin` (busy) and `animate-pulse` (waiting), only behind `motion-safe:` |

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
| `Menu…`, `ContextMenu…` | `menu.tsx` | Items with an optional icon and shortcut; the context menu also opens with Shift+F10 or the context-menu key. `MenuCheckboxItem` turns something on or off with a check and keeps the menu open (the recipe browser's filters) |
| `Tooltip` | `tooltip.tsx` | Opens on hover and keyboard focus; needs one `TooltipProvider` at the root |
| `Dialog` | `dialog.tsx` | Title, optional description, body and a footer with the primary action last; focus is trapped and returns to the trigger |
| `Tabs` | `tabs.tsx` | A segmented control; arrow keys move between tabs |
| `Toggle`, `Switch` | `toggle.tsx` | A pressed/unpressed icon button for toolbars, a switch for on/off settings |
| `Kbd` | `kbd.tsx` | Shows keys already in display form |

Popovers (menus, select lists) float on frosted glass (`popoverSurface`); dialogs sit on a solid surface over a blurred scrim. Number formatting and parsing (decimal comma, units typed after the number, no float noise) live in `number.ts`.

## Shell

The shell ([[src/client/app.tsx]], `src/client/shell/`) is a top bar over a full-bleed canvas, with side panels floating over the canvas on frosted glass and toasts at the bottom centre.

- **Side panels:** the left one (Library: the recipe browser and the factory's blueprints, see Recipe browser below) and the right one (Inspector). Both are open by default, and both show only while a factory is open: the welcome and the game picker have the whole window, and the panels come back as the person left them once a factory opens ([[CARB-116]]). Each has a close button and a resizable inner edge: drag it, or focus it and use the arrow keys (Shift for bigger steps), Home and End for the limits, Enter to close. The top bar toggles them. What the person chose, whether a factory is open and the widths live in a session store (`shell/panels.ts`); the limits are in `shell/panel-layout.ts` (the library 240–440 px, 304 by default, so recipe names fit).
- **Opening a factory fits it readably** ([[CARB-139]]): the canvas zooms to fit the factory beside the side panels, but never below full cards (`READABLE_ZOOM` in [[src/client/canvas/model/lod.ts]], 60 %), centred on the factory. A factory that doesn't fit at that zoom shows its middle in full cards, with rates, and runs on under the panels; *Zoom to fit* (`F`) shows all of it, at whatever tier that takes. The tour's starter and the screenshot scenes are fitted whole instead: they are pictures to see all of. The first view is reported once React Flow's fit is done (it waits for the nodes to be measured), so a move made on it isn't undone.
- **Inspector:** renders the selected node's plugin fields from their `FieldDescriptor`s ([[Architecture/Plugins]]), with no plugin UI code. The live app gets them from `packs.describePlugin` (fields by building), so a recipe node shows the fields of the building it runs in. Above the production section it lists the node's warnings and errors (a triangle or a circle icon with the message, so colour isn't the only signal); below it, a **Metrics** section shows what the plugin derived after the solve (power use, power generated) with the plugin's labels and units. `number` becomes a slider with a stepper and the unit, `choice` a select, `toggle` a switch. A value that is missing, of the wrong kind or out of range shows the default or the nearest allowed value. Each committed edit is one `setNodeFields` command to `editing.apply`, labelled for the undo history ("Set Clock speed to 150 %"); the control keeps the new value until the call returns, and a refused edit shows an error toast. The inspector itself only calls `onFieldEdit`; `InspectorPanel` does the wiring.
- **Save profile:** with no node selected and a document open, the inspector shows the document's save profile ([[Architecture/Plugins]], The save profile): the plugin's save settings as the same controls as node fields, then *Planner* (the planner card's building choices and resource weights, saved with the document), then "Alternate recipes" with a count ("109 of 110 unlocked"), a filter field, "Unlock all" and "Lock all", and a checklist. A ticked box keeps its new state until the edit has gone through. With several nodes selected the inspector shows nothing selected.
- **Commands:** every action is registered once in the command registry ([[src/client/core/commands.ts]]) with an id, a title, a group, an icon and, for everyday actions, a shortcut (rarer ones such as "Arrange top to bottom" are reached through the palette and menus); the app's commands are in [[src/client/shell/app-commands.ts]]. The command palette, the app menu (behind the wordmark), the keyboard and the tooltips all read the registry, so a new action needs only a registration. Shortcuts are written as `Mod+Shift+K` (`Mod` is Ctrl, or Cmd on a Mac) and shown in each platform's style; plain-key shortcuts don't fire while a text field has focus. A duplicate id or shortcut throws when the registry is built.

| Command | Shortcut |
| --- | --- |
| Command palette | `Ctrl+K` |
| Toggle library | `Ctrl+B` |
| Find a recipe (opens the library on its search field) | `R` |
| Toggle inspector | `Ctrl+I` |
| Switch light and dark theme | `Ctrl+Shift+L` |
| Plan production… | `P` |
| Toggle totals | `T` |
| Sankey overview | `S` |
| Bottleneck heatmap | `H` |
| Rename factory… | `F2` |

- **Command palette** (`Ctrl+K`, or the search field in the top bar): type to filter, arrow keys to move, Enter to run, Escape to close. With a document open, typing an item or recipe name also lists **quick-add** entries: every recipe of the document's pack, found by its name, its outputs and their aliases, and its buildings, showing where it runs and what it turns into what. Picking one sends one `addNode` command to `editing.apply` ("Add Iron Plate") and confirms with a toast. Quick-added nodes land in the middle of the visible canvas, clear of the nodes already there ([[Design/Editor quality of life]], Auto-arrange and lock).
- **Toasts:** `toast({ title, description, tone })` from anywhere in the client; `info` and `success` close after 4 s, `error` after 8 s. At most three show at once. Screen readers announce them and F8 jumps to them.

### Recipe browser

The library's first tab ([[src/client/features/recipe-browser/recipe-browser.tsx]], [[CARB-134]]): every recipe of the open factory's pack, so a player finds any recipe without knowing its name, and the panel is useful from a factory's first second. The second tab holds the factory's blueprints ([[Design/Editor quality of life]], Subgraphs); the tab chosen stays for the session.

- **Groups:** by machine (each recipe under its default building, in the pack's order of buildings), and by category or by unlock where the pack lists them ([[Architecture/Game packs]], recipe groups): Factorio's crafting menu rows under their tab, Satisfactory's milestones under their tier and MAM research. Recipes without a category come last ("Other"), those without an unlock first ("From the start"). The pack's sections are headings between the groups. Within a group, recipes follow their main product, a standard recipe before its alternates, so alternatives sit together. The choice is a segmented control (Machine, Category, Unlock), remembered per pack for the session.
- **Rows:** a group shows a chevron, a tile (the building's monogram on the accent, or an icon), its name and its count. A recipe shows its main product's chip, its name with an `Alt` badge for alternates, and below what it takes (with the building when the grouping doesn't say it). A star shows on hover and stays, filled in the accent, on favourites. Rows are 36 and 44 px: dense, but each has one line to read.
- **Open and closed:** a pack of up to 60 recipes starts with every group open, a bigger one with them closed. Opening or closing a group slides the rows below into place and fades the new ones in (`--duration-base`, so reduced motion turns it off); typing never animates.
- **On top:** *Favourites* (starred recipes, in the order starred), *Recent* (the last 8 recipes added to any factory of the pack, newest first) and *Suggested* (below), each a group of its own that starts open, then the pack's groups under *All recipes*. Favourites and recents are the person's preferences (`workspace.setPreferences`, `recipes` by pack id, [[src/client/features/recipe-browser/memory.ts]]), so they survive restarts; a recipe counts as added from the browser, quick-add and the recipe picker. Stars are set on a row (its star, `F`, or its context menu), on a recipe node's context menu (*Add to favourites*, the `recipe.toggleFavourite` command) and in the inspector's header. Quick-add offers favourites and recents first: as groups of their own while nothing is typed, and ahead of other matches while typing.
- **Suggested** ([[src/client/features/recipe-browser/suggest.ts]], [[CARB-136]]): plain rules, no learning. Around the selection, a maker for each input nothing feeds and a user for each output nothing takes; then, from the last solve, a maker for each input a machine is short of and a user for each output nothing takes, the largest first. One recipe per port (main product first, standard before alternate, the ones the factory uses before others; recycling and raw resources left out), each offered once, at most five, each with its reason in place of what it takes ("Circuit lacks 0.2/s of Iron Plate"). Adding a suggestion connects it to that port, beside it, in the same undo step.
- **Search:** typing (the field is at the top; `R` anywhere focuses it) lists what matches every word, best first, under how many there are: recipes named for the words, then those making a matching item, then the rest (what they take, where they run, what unlocks them, `alternate`). Names starting with the first word lead, standard before alternate. `↓` or `Enter` goes into the list, `Esc` clears.
- **Filters** (the sliders button, with a dot while not the default): *Alternate recipes* (shown) and *Recycling* (hidden; the pack's recipes tagged `recycling`, Factorio's 282). When a search matches only hidden recycling, the empty state offers to show it.
- **Adding:** a click adds the recipe mid-view, clear of the other nodes; a drag picks it up as a ghost that follows the pointer over the canvas (snapping like a dragged node) and lands where it's let go; `Enter` adds it from the keyboard and moves the focus to the new node (`Shift+Enter` adds and stays in the list). The new node is selected, so the inspector shows it, and a screen reader hears "Added Iron Plate". All three go through the canvas on screen (`canvasEditActions().addNode`, or for a drag the canvas's `placing` store, [[src/client/canvas/placing.ts]]), so a recipe lands in the graph on screen, inside a subgraph too; quick-add takes the same way.
- **Keyboard:** the list is a tree (`role="tree"`): `↑↓` move, `Home`/`End` jump, `→` opens a group or goes into it, `←` closes it or goes up to it, `Enter` toggles a group or adds a recipe, `F` stars, `Shift+F10` opens a row's menu (*Add to factory*, *Add to favourites*), `↑` on the first row goes back to the search field. One row is a tab stop; it keeps the focus when it scrolls away.
- **Speed:** the list draws only the rows in view and a few around them (fixed row heights, [[src/client/features/recipe-browser/recipe-tree.tsx]]), so Factorio's 600 recipes cost what 30 do. Grouping, search and suggestions are pure functions ([[src/client/features/recipe-browser/browse.ts]]) in the client, like the recipe picker's rules: they order what one person sees while they type, which a round trip per key press would only slow down.

## Flows as the hero visual

- Edge thickness grows with the log of throughput. Animated particles travel along edges, and their speed and density encode the rate. Animation turns off automatically when zoomed out or when the user prefers reduced motion.
- Saturation colours: teal means healthy, amber means more than 90% of belt capacity, red means over capacity or a deficit. A colour-blind-safe palette is available as an option.
- An optional **bottleneck heatmap** overlay and a **Sankey** overview mode give a whole-factory view (see Whole-factory views below).

How the canvas does it ([[src/client/canvas/model/flow-style.ts]], styles in `src/client/canvas/canvas.css`):

| Aspect | Rule |
| --- | --- |
| Width | 1.5 flow units plus 3 per tenfold rate, counted from 0.1 items/s, capped at 14: a trickle stays a visible hairline, a main bus is fat but never swallows its cards |
| Colour | Healthy up to 90% of the edge's capacity, near capacity above, over capacity above 100% (with a little tolerance for float noise) or when the solver reports an overflow. Edges without a belt or pipe are healthy; edges without a result are drawn in `line-strong` |
| Emphasis | The line is the saturation colour at 72%; hover and selection make it solid. Near and over capacity add a soft halo, so trouble catches the eye at any zoom |
| Particles | Round dots made from a dash pattern (`0 <spacing>`, round caps), moved by animating `stroke-dashoffset`: one cheap path per edge, no per-particle elements. Speed is 40 flow units/s plus 30 per tenfold rate (at most 240); spacing shrinks from 64 to at least 18 as the rate grows. They are lighter tints of the flow colour |
| Motion cut-offs | Particles are hidden below zoom 0.45 (a class on the canvas, set when the zoom crosses the threshold) and entirely with `prefers-reduced-motion` |

The flow colours come from the runtime `--flow-*` inputs, so `data-palette="colorblind"` swaps them everywhere, the halo and particles included.

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
| Frame | Dashed, tinted area behind everything | Its label, which grows as the cards shrink but always fits in the two grid steps above the frame's nodes |
| Subgraph instance | A machine card with a second card peeking out behind it | Header: a stack icon, the blueprint's name, its scale. A strip with how it runs and an *Open* button (an accent pill). One row per port of the blueprint, as for a recipe |
| Port (inside a blueprint) | Pill with a dashed accent edge | Item chip, item name, rate, and "Input" or "Output" |

- **Geometry is fixed** per node kind and port count ([[src/client/canvas/model/geometry.ts]]), so ports, and so edges, sit in the same place at every level of detail and in any renderer, and edges of nodes that were never on screen still have their ends.
- **Item chips** are the fallback for packs without icons, which is every pack today: a monogram (initials of the first two words, or the first two letters of one word) on a tint whose hue is a hash of the item id, so an item looks the same everywhere. Solids are rounded squares, fluids circles, so shape and text carry the meaning, not only colour. The tint variables (`--item-bg`, `--item-fg`, `--item-line`, `--item-wash`) are derived in `src/client/canvas/canvas.css` from `--hue`; ports use the same tint, so a port matches its row's chip.
- **States:** selected nodes get an accent ring; a node short of an input gets an over-capacity ring, and the short port shows a warning triangle next to its rate (colour is never the only signal). Without results, rates read "—" and the strip reads "Not solved yet".
- **Rates** use the document's unit (else the pack's), with about three significant figures ([[src/client/canvas/model/format.ts]], a stand-in until the rational display of [[CARB-13]]).
- **Flows that run backwards** (recycling loops) leave to the right, loop below both nodes with rounded corners and enter from the left, so they never cut through a card.

### How the canvas is built

`Canvas` ([[src/client/canvas/canvas.tsx]]) takes a `Document`, its `PackData` and the latest `AnalysisResults` as props, so it works the same with fixtures and with the read model. It builds a renderer-neutral scene ([[src/client/canvas/model/scene.ts]]: node and edge views with names from the pack and fixed geometry; unchanged nodes keep their view, so their components don't render again) and hands it to the renderer through the `CanvasAdapter` seam ([[src/client/canvas/adapter.ts]]). The renderer reports intents (nodes dropped, ports connected), and `Canvas` turns them into `editing.apply` commands sent through the connector.

Results bypass React state: they go into per-node and per-edge slots ([[src/client/canvas/model/result-slots.ts]]), each node and edge subscribes only to its own slot, and a new solve notifies only the slots whose values changed.

The side panels float over the canvas, so the canvas reads which are open and treats them as **insets**: fitting the graph keeps it in the area they leave visible, and `viewportCentre()` ([[src/client/canvas/viewport.ts]]) gives the flow position in the middle of that area, for features outside the canvas such as quick-add. React Flow's credit sits at the bottom centre, the one place the panels never cover (we keep the credit rather than hiding it).

## Core interactions

- Dragging from a port into empty space opens a **recipe picker filtered by that item**, showing producers or consumers depending on the port direction. It's ranked by how often you use each recipe and previews alternates side by side.
  - An output offers the recipes that consume the item and an output (sink); an input offers the recipes that make it and a source, the source first when the item is a raw resource ([[src/client/features/recipe-picker/picker.ts]]).
  - Order: recipes used most in the document, then those making the item as their main product (alternates included) above byproduct makers, then standard before alternate, then by name. Usage is counted in the open document until preferences can remember picks across documents.
  - From the keyboard: `Enter` twice on a focused port (Accessibility, Keyboard map below).
  - The panel opens beside the drop, on the side away from the port, clear of the side panels; typing narrows by every word (names, buildings, items, aliases, "alternate"); ↑↓ move and preview, Enter adds, Esc or a click outside cancels.
  - The new node's connecting port lands under the pointer (snapped to the grid horizontally), and adding plus connecting is one `editing.apply` batch, so it's one undo step.
- A **command palette** (`Ctrl+K`) reaches every action. Typing "iron plate" quick-adds a node.
- **Collapse to subgraph** (`Ctrl+G`), zoom-into transitions, breadcrumbs and a blueprint library ([[Architecture/Subgraphs]], [[Design/Editor quality of life]]).
- **Goal planner:** pick target outputs and rates; the app proposes the whole chain as a ghost you can accept, adjust or discard (see Goal planner below).
- **Inspector** side panel: plugin fields, per-item breakdowns, and "what-if" recipe swaps with delta previews.
- **Totals dashboard:** raw resources against map limits, power, building counts and build cost.
- Undo/redo with a history panel; multiple document tabs; autosave; share links.
- First run asks which game you're playing and opens a starter factory for it, with an interactive tour (Welcome and tour below).
- The many smaller conveniences are on [[Design/Editor quality of life]].

### Goal planner

`Plan production…` (`P`, or the command palette) opens the planner card at the canvas's top-left, beside the library when it's open ([[src/client/features/planner/planner-panel.tsx]]). The canvas counts the card as an inset, like the side panels, so fitting keeps clear of it.

| Stage | Shows |
| --- | --- |
| Goals | One row per goal: an item picker (type to search names, aliases and ids; what recipes make first, raw resources marked) and a rate in the document's unit, 1/s worth by default. *Add a goal*; options *Use as few* (Resources or Buildings), *Alternate recipes*, one select per building family (the default building on the left, the building its recipes run in on the right: Stone furnace → Steel furnace), and *Resource weights*, folded away, a weight per raw resource (1 each). The building choices and weights are the document's, saved with it: each change is an undo step, and the Save profile shows them too. *Plan* asks the `planning` manager ([[Architecture/Planning]]) |
| Proposal | The goals as chips; three stats (machines to build, power in MW, total raw input); buildings by count; raw inputs with a bar against the map's limit (healthy, amber above 90%, red over); byproducts; a red callout for what the map can't supply. *Discard*, *Adjust* (back to the goals, now the proposal's, the ghost stays until the next plan), *Accept* (focused, so Enter accepts) |
| Accepted | "Added to …", with *Undo* (the whole plan is one step), *Plan more* and *Done* |

The proposal appears on the canvas as a **ghost** beside the factory, brought into view with the nearby part of the factory when cards stay readable at that zoom (otherwise the ghost alone). Accepting asks `editing.applyProposal` to add it where the ghost was left, as one undo step labelled "Plan 15/min Motor". Escape, *Discard* and closing the card discard it (`planning.discardProposal`).

The card follows the planning manager's proposals (`proposalChanged`, [[Architecture/Planning#Proposals]]), not only its own: a proposal an MCP client makes with `plan_production` opens the card on its document's tab, in the *Proposal* stage, as if the person had planned it. When the model accepts it (`apply_proposal`) the card moves on to *Accepted*; when the person discards it, the model is told so.

### Totals

The totals dashboard sits at the canvas's bottom-left ([[src/client/features/totals/totals-panel.tsx]]), following the latest solve. Collapsed, it's a pill: machines, power and, in red with a warning sign, any raw resource drawn beyond the map's limit. Expanded (click it, or `T`, "Toggle totals"), a card like the planner's summary: machines, power in MW and total raw input as tiles (compact as `50.3k` when large); raw resources with a bar against the pack's `resources.limit` (healthy, amber above 90%, red with a warning sign over it); buildings by count; what leaves through outputs; and a red callout for shortages. The expanded card counts as an inset for fitting; while the planner is open it hides, since the planner sums up its proposal.

The numbers ([[src/client/features/totals/summary.ts]]) are the analysis's `totals` (raw inputs, buildings rounded up per node) plus power (the plugin's derived `power` metric in MW, or `powerMW`; else the building's `power.consume` × machines), sink throughput as outputs, and deficits and surpluses from the diagnostics. The planner's card uses the same summary parts. Build cost waits for packs to describe costs.

### Whole-factory views

- **Sankey overview** (`S`, Escape closes; [[src/client/features/sankey/sankey.ts]]): the factory as columns of bars joined by bands as wide as their rates, over the canvas and clear of the side panels. Columns follow the longest path along the flow (sources first, sinks last). Junctions don't get a column: their flows pass straight through, each inflow matched to the outflows in canvas order, and a band through an overloaded belt keeps its warning. A band that skips columns takes a slot in each column it passes, so it never runs through a bar. Within a column, bars start in the canvas's top-to-bottom order and are reordered by barycentre sweeps (the order with the fewest rate-weighted crossings wins), then nudged level with what they connect to and the chart centred. One scale for every band, so the fullest column fills three quarters of the height. Bands are filled shapes in their item's tint (a wide stroke folds over itself on steep bends); flows near or over capacity get an amber or red outline; recycling loops (flows that run right to left on the canvas) run back below the chart, dashed. Hovering a bar or band dims everything not connected to it. Labels (name and rate in the document's unit) sit beside their bar where the bands leave room: an output's to its right; any other's above its bar, running right or left, else below, whichever covers the least band, bar or other label. A column keeps room for a label above each bar.
- **Bottleneck heatmap** (`H`; [[src/client/features/heatmap/heat.ts]]): soft radial glows drawn over the canvas in flow coordinates (the canvas's `overlay`): amber along flows above 90% of their belt's capacity, red along flows over it and around machines short of an input. Healthy flows fade while it's on. A legend at the top says what the colours mean.

Both, the planner and the totals are wired into a document's canvas by one hook, `useFactoryOverlays` ([[src/client/features/planner/factory-overlays.tsx]]).

### Ghosts

A ghost previews nodes and flows that aren't in the document yet: planner proposals, blueprints dragged from the library, pastes and duplicates ([[Design/Editor quality of life]], Clipboard and ghost placement, Subgraphs). It lives in `src/client/canvas/ghost/`:

- **API:** `Canvas` takes `ghost: { graph, positions, results?, placement, label }` and reports `onGhostPlace(offset)` and `onGhostCancel()`. `placement` is `{ mode: "fixed", offset }` (drawn there; dragging moves it as one and reports the new offset when dropped) or `{ mode: "pointer", at? }`. `placedPositions(positions, offset)` gives where its nodes land. A paste waiting to be placed is drawn instead of the `ghost` prop: it's what the person did last.
- **Pointer mode** (pastes, duplicates): the ghost starts centred on `at` (flow units) when given, else under the pointer if it was last on the canvas, else mid-view. Its centre then follows the pointer anywhere on the canvas, over nodes too, and snaps as a dragged node does: onto a neighbour's edges or centre, even spacing, or else its top-left corner onto the grid, with the same guides and spacing marks; `Alt` places freely. A click anywhere on the canvas or `Enter` places it, `Escape` cancels, the arrow keys move it a grid step (`Shift`: four). Nothing else on the canvas takes the pointer meanwhile (no selecting, dragging or connecting), the cursor is `copy`, and the frame breathes softly unless reduced motion is on. Its label reads "Paste 3 nodes · click to place · Esc to cancel". It follows in grid steps without easing, the way factory games place blueprints: an eased glide would pull the nodes away from their flows, which React Flow draws from the nodes' final positions.
- **Drawing:** the ghost's nodes and edges are the canvas's own components under `ghost:` ids, so they match every level of detail; `results` (by the ghost's own ids) feed their machine counts and rates. They are translucent with a dashed accent outline, flows are dashed in the accent, and ports are hidden; none of it can be selected or connected. Behind them a dashed, accent-tinted **frame** with a label ("Proposal · drag to move") that keeps its size on screen is the handle to drag the ghost by.
- Moving a ghost changes only its placement, so its content isn't rebuilt and it isn't revealed again.

### Welcome and tour

The first impression (`src/client/features/onboarding/`): one question, then a real factory and the real core loop, in about a minute.

- **First run** (no tour progress in the preferences, [[Architecture/Documents]], Preferences): the welcome screen asks *Which game do you play?* with one card per game pack (a monogram on the pack's accent, the game's name and version). Picking one opens the pack's first starter factory ([[Architecture/Game packs]], Starter factories), or an empty factory when it has none, and starts the tour. *Skip — I'll find my own way* goes to the usual welcome and is remembered.
- **The tour** is a card at the top of the canvas (`TourCard`), with a breathing accent ring around what the step is about. Its steps follow the core loop on the starter factory: *Welcome*, *Add a recipe* (the palette, ringed), *Connect it through its ports*, *Set a target* (the inspector, ringed), *Watch it solve*, *Let Carbonara plan* (`P`), *You're all set*. Steps that ask for something wait ("Waiting for you") and move on by themselves once the factory shows it was done ([[src/client/features/onboarding/tour.ts]]: a new recipe node; that node connected on both sides; a target set or changed; the planner open); the others have *Next*.
- **Skippable and resumable:** the card's × or *Skip tour* closes it where it is, and *Skip step* moves on. Progress is saved in the preferences after every step, so a reload carries on with an unfinished tour, and a finished or skipped one never starts by itself again. *Take the tour* in the command palette resumes it where it was left (from the start once completed); with no factory open it asks for a game first.
- **Keyboard and assistive tech:** the card is a non-modal dialog; starting the tour or moving on with its buttons focuses its main button, so Enter goes through the explaining steps, while steps that move on by themselves leave the focus where the person is working. The title and text are a polite live region, so each new step is announced. The ring and the card's entrance follow the motion tokens; the ring only breathes without `prefers-reduced-motion`.
- **Tests:** [[e2e/onboarding.spec.ts]] completes the tour on the Template Works starter and checks that skipping is remembered and the palette resumes it, plus screenshots of the game picker and a tour step in both themes. Automated browsers (`navigator.webdriver`) skip the first run unless the address has `?first-run`, so no other spec sees it.

## Performance

Large graphs stay smooth through three measures ([[CARB-18]]):

| Measure | How |
| --- | --- |
| Levels of detail | [[src/client/canvas/model/lod.ts]]: full cards from zoom 0.6, compact cards (building tile, title and machine count in large type) from 0.25, chips below (neutral blocks with the recipe's monogram; sources and sinks in their item's tint; red rings for trouble; frame labels grow so frames stay landmarks). One subscriber to the zoom for the whole canvas, so nodes re-render only when the tier changes. Every tier keeps the same size and ports, so edges never move |
| Culling | React Flow's `onlyRenderVisibleElements` while zoomed in. At chip zoom most of the graph is on screen, and mounting and unmounting chips at the screen edges on every pan frame cost more than drawing them all, so culling is off there. Nodes carry their known size as `measured`, so culled nodes still count when fitting |
| Windowing large graphs | Above 2,000 nodes React Flow gets only the window around the view ([[src/client/canvas/model/window.ts]]): the nodes within half a view of it, both ends of every flow crossing it, and whatever is selected or dragged. A grid of buckets over the nodes and flows finds them; the window moves only when the view leaves it (or is a sixteenth of it, after zooming in). React Flow scans every node it has on every pan frame (culling, its selection listener), so this is what keeps a 50,000-node graph as cheap to pan as a 1,000-node one. Culling stays on at chip zoom there. Fitting the whole graph or a far node reads every node itself; picture export draws all of them |
| Results outside React | Per-slot results (see Nodes, How the canvas is built); particles stop when zoomed out |

**Chips of a large graph are the limit.** At chip zoom a 50,000-node graph puts thousands of nodes on screen, and each is a React component with DOM elements and a store subscription: 2,400 of them cost 160–220 ms a frame whether culled (they mount and unmount at the edges) or not. Drawing that tier on one canvas instead of as nodes is [[CARB-100]].

Tried and dropped: promoting the viewport to its own compositor layer while panning (`will-change: transform`). It halved the compact tier's frame time but made the overview much worse, because culling invalidated the layer every frame, and without culling at the overview it gained nothing.

**The perf harness** (`e2e/canvas-perf.spec.ts`, scene `perf`: 1,000 nodes, 800 flows; scene `perf-50k`: 50,000 nodes, 40,000 flows) pans through React Flow's real input path once per animation frame and reads the main thread's CPU time per frame from Chrome (`ThreadTime`). That is the stable measure: frame intervals on a shared machine mostly measure the other processes. Under 16.7 ms the main thread can hold 60 fps (raster and compositing run on other threads). CI runs it against the dev server, keeps the best of three runs (on a shared machine the fastest run is the closest to the code's own cost), with budgets of 16.7 ms for full and compact cards and 25 ms for the whole graph on screen. The 50,000-node scene is held to the card budgets.

Measured on a 4-vCPU cloud VM with software rendering, main-thread ms per frame:

| View | Nodes mounted | Development build | Production build |
| --- | --- | --- | --- |
| Full cards, zoom 1 | ~21 | 5.6–5.8 | 3.2–3.9 |
| Compact cards, zoom 0.4 | ~99 | 10.5–10.8 | 5.0–6.5 |
| Chips, whole graph on screen | 1,000 | 14.7–17.4 | 12–17 |
| 50,000 nodes, full cards, zoom 1 ([[CARB-59]]) | ~21 | 5.6–6.7 (15.1 before windowing) | — |
| 50,000 nodes, compact cards, zoom 0.4 | ~99 | 10–11 (22.4 before windowing) | — |
| 50,000 nodes, chips, zoom 0.08 | ~2,400 | 160–220 | — |

Before levels of detail and culling the full-card view took about 10 fps on the same machine, mostly from particles animating on off-screen flows. The production numbers need a build that keeps the scenes: `VITE_CANVAS_SCENES=true vite build`, then `vite preview` and `?scene=perf&zoom=…&focus=wire-95`. Frame rates on that VM varied between 15 and 57 fps for the same code with the machine's load, so they aren't a budget; the 20-node chain itself only reached 40–50 fps there.

## Accessibility

Full keyboard navigation (between nodes and ports), visible focus rings, ARIA on panels, reduced-motion support, and colour never as the only signal ([[CARB-66]]).

### Keyboard map

Everything the mouse does on the canvas has a keyboard path. The commands (palette, menus, shortcuts) are in the Shell table above and on the cheat sheet (`?`); these are the keys that work on what has the focus:

| Where | Keys | What happens |
| --- | --- | --- |
| Anywhere | `Tab`, `Shift+Tab` | The top bar and its tabs, then the canvas (its flows, then its nodes, each followed by its ports) and the panels |
| Factory tab | `Delete` | Closes that factory; the focus moves to the next tab (the × button is for the pointer) |
| Node | `Enter` / `Space`; `Shift+Enter`; `Escape` | Selects it (the inspector shows it); adds it to the selection; deselects |
| Selection | Arrows (`Shift`: four steps) | Nudges it a grid step, one undo step per press |
| Port | `Enter` / `Space` | Starts a connection from it ("Connecting from Output Copper Plate" is announced) |
| Another port | `Enter` | Ends the connection there ("Connected Copper Plate", or why it can't) |
| The same port again | `Enter` | Opens the recipe picker for it, as if a connection had been dropped beside it: the new node lands six grid steps out |
| While connecting | `Escape` | Lets go of the connection |
| Paste ghost | Arrows (`Shift`: four steps), `Enter`, `Escape` | Moves it a grid step, places it, cancels |
| Recipe browser | `↑↓`, `←→`, `Home`, `End`, `Enter`, `Shift+Enter`, `F` | Moves, closes and opens groups, adds a recipe (and moves to it, or stays), stars it (Recipe browser above) |
| Subgraph instance | `Mod+↓`; `Mod+↑` inside | Opens it, the focus on its first node; leaves it, the focus back on the instance |

### Guarantees

- **The focus never drops to the page.** What the keyboard makes gets the focus once it's drawn: a node quick-added from the palette or picked in the recipe picker ([[src/client/canvas/focus.ts]]), the first node inside a subgraph, the instance after leaving it. Dialogs (Radix) hand it back to what opened them; the planner card, which isn't a dialog, does the same ([[src/client/ui/focus-return.ts]]); a recipe picker closed without a pick hands it back to its port. `Escape` in the planner's item field closes its list and keeps the focus there; a second `Escape` closes the card.
- **Visible focus:** every focusable element shows an accent ring (2 px, `:focus-visible`), nodes an outline around the card, flows turn the accent, ports a ring. Rings and outlines are in the accent (fields add a soft halo around an accent hairline); the soft accent alone is never the focus ring, it is too faint to see.
- **Names and roles:** nodes are named groups ("Copper Wire (Assembler)", "Motor output", [[src/client/canvas/model/node-label.ts]]); ports are buttons ("Input Copper Plate"); the factory tabs are a tab list of tabs only; a segmented choice without panels (the planner's *Use as few*) points at no panel.
- **Contrast:** text tokens keep WCAG AA (4.5:1) on every surface up to `surface-3`, `fg-faint` included, so faint labels and placeholders are legible too (Tokens above).
- **Announcements, without spam:** toasts are announced (errors assertively); the tour card's step is a polite live region; the planner's shortfall callout is an alert when a plan appears; connecting from the keyboard speaks through React Flow's live region. The totals say what the factory is short of and which raw resources it draws beyond the map in a polite status, in names only ([[src/client/features/totals/announcement.ts]]): it speaks when the problems change, not on every solve while a value is dragged, and says nothing while nothing is wrong.
- **Reduced motion:** every duration is a token that drops to 0 with `prefers-reduced-motion`, camera moves (fit, zoom to selection, bookmarks, subgraph dives) take the same tokens, and the loops (flow particles, the ghost's and the tour ring's breathing) stop.

### Tests

- [[e2e/a11y-axe.spec.ts]] runs axe-core (WCAG 2.2 A and AA plus best practices) over every canonical scene in both themes and the live app's main states: the welcome and the game picker, the new-factory dialog, a factory with a node in the inspector, the library's blueprints, the recipe browser (grouped, with favourites, searching), the planner card, the totals, the Sankey overview, the command palette, the cheat sheet, a port's recipe picker and a tour step. A violation fails with axe's description; the full report is attached to the test. One exception: *target size* (WCAG 2.5.8) leaves out the canvas's ports, which are drawn in flow units (10 px at 100 %, smaller zoomed out, like a map's pins); dragging snaps to a port within 20 px and every port is a keyboard button.
- [[e2e/a11y-keyboard.spec.ts]] goes through the core flows with no mouse event at all: create a factory, add recipes through the palette, connect their ports, add an output through a port's picker, set its target in the inspector, plan with `P` and accept, undo; copy and paste with the ghost (arrows and `Enter`), collapse into a subgraph, enter and leave it, undo, close the tab with `Delete`. Each step checks where the focus is.
- [[e2e/a11y-motion.spec.ts]] emulates reduced motion and checks that nothing animates (`document.getAnimations()`) after opening the palette, planner, totals, Sankey and cheat sheet, while a paste ghost waits, and diving into a subgraph and back, and that camera moves end on the next frame; and, as a control, that flows do move without it.

## Visual QA

Playwright screenshot tests cover a set of canonical scenes: empty state, a 20-node chain, a congested graph, inside a subgraph (`subgraph`: a copper wire line placed twice, from inside, with its breadcrumbs; `e2e/subgraphs.spec.ts` also shows its instance cards and the library), the ghost paste, and each in dark and light. UI work is checked against these scenes before it's merged, and an intentional visual change updates the baseline in the same commit. The scenes, how to add one and how to update the baselines are on [[Development]] (Scenes, Screenshot tests). The goal planner and the totals have scenes of their own: `planner` (`e2e/planner-scene.spec.ts`), a real proposal for 15 motors a minute beside a small copper line, and `totals` (`e2e/planner-totals.spec.ts`), a planned gear and wire works with ferrite near the map's limit and cuprite over it. Both read fixtures in `src/client/scenes/` that `src/managers/planning.test.ts` produces with the real engines and keeps current (`UPDATE_FIXTURES=1` regenerates them).

The canvas scenes are fixtures in `src/client/canvas/scenes/`, built on the template pack (read straight from `packs/_template`). In development, `?scene=<name>` shows one, for example `/?scene=chain`; add `&zoom=1&focus=<node id>` to look at it up close. Edits in a scene go through the real connector and RPC dispatcher to a scene backend that applies them in memory, and that backend lists them in `window.carbonaraScene.commands` for e2e tests. The scene code is left out of production builds.

[SUBPAGES]
