# Editor quality of life

These features decide whether the editor feels pleasant during a long session. They're first-class scope, not polish. The rules behind them (what a paste keeps, how bridging reconnects) live in the `editing` engine; the `layout` engine does the arranging.

[TOC]

## Layout and alignment

- **Auto-arrange** the whole graph or the selection, left → right (default) or top → bottom. It uses ELK layered layout with ordering that follows the item flow, to keep edge crossings low, and animates to the new positions. Locked nodes stay where they are.
- **Align** left, centre, right, top, middle or bottom. **Distribute** horizontally or vertically. **Straighten chain** lines up a linear chain on one row.
- Snap to grid (hold `Alt` to bypass), smart alignment guides with spacing indicators, and arrow-key nudging (`Shift` for big steps).

### Align, distribute, straighten

Select two or more nodes and a **selection toolbar** appears at the top of the visible canvas, with the commands below plus arrange and lock. Its buttons are the registered commands (same titles, icons, shortcuts as the palette). Each command is one `moveNodes` edit with only the nodes that actually move; the rules are pure functions in [[src/client/canvas/model/align.ts]] (the canvas owns node sizes and ports, as with snapping).

| Command | Shortcut | Does |
| --- | --- | --- |
| Align left / right / top / bottom edges | — | Lines the nodes up on that edge of the selection's bounds |
| Align centres / middles | — | On the bounds' vertical / horizontal centre line |
| Distribute horizontally / vertically | — | Equal gaps between the nodes (three or more), keeping the outermost two; whole flow units |
| Straighten chain | `Shift+S` | From each selected node no selected flow feeds (left to right), every node it feeds moves up or down so their ports are level; nodes keep their x |

Locked nodes never move: when the selection has some, aligning lines the others up on them.

### Auto-arrange and lock

| Command | Shortcut | Does |
| --- | --- | --- |
| Arrange left to right | `Shift+A` | Lays out the selection (two or more nodes), or else the whole graph, flowing to the right |
| Arrange top to bottom | — | The same, flowing down (palette and menus): the arranged nodes take their flows in along their top edge and give them out along the bottom (`flow: "down"` on their positions); arranging left to right turns them back |
| Lock or unlock selection | `Shift+L` | Locked nodes wear a padlock; dragging, nudging and arranging leave them where they are. Unlocks when every selected node is locked |

How arranging works ([[src/engines/layout/arrange.ts]], called by `editing.arrange` in [[src/managers/editing.ts]]):

- **ELK layered** with fixed port positions: the client sends each node's size and port offsets (`shapes`, [[src/contracts/layout.ts]]), because only the canvas knows its geometry. Nodes keep today's reading order where ELK can (`considerModelOrder`), so arranging twice changes nothing and small edits don't reshuffle the factory. Sources start the flow (first layer), even when they feed a loop deep inside it. Network-simplex node placement gives straight runs between ports.
- **Frames move with what they hold.** A frame takes part when it and every node whose centre it holds can move: it becomes a compound node in ELK and is resized around its nodes, with room for its label. Otherwise it stays, and its nodes are arranged like any other. Notes inside a moving frame move with it; notes outside frames stay.
- **What stays put:** locked nodes and the nodes outside the selection. The arranged block keeps the top-left corner of where its nodes were (on the grid) and is pushed clear of the nodes that stay, across the flow.
- It is **one edit** ("Arrange": a `moveNodes` step), so one undo puts everything back.
- **Which way flows run** is per node, on its position (`flow: "down"`, [[src/contracts/document.ts]]), so arranging a selection top to bottom doesn't turn the rest of the factory. Such a node's ports are spread evenly along its top edge (inputs) and bottom edge (outputs) ([[src/client/canvas/model/scene.ts]], `oriented`); the client sends the layout engine the shapes the nodes will have, and ELK gets the matching port sides (north and south). Flows leave and enter the way their ports face, and a flow that runs back up loops to the right of both nodes ([[src/client/canvas/model/edge-path.ts]]). Locked nodes keep theirs. Straighten chain and the align commands still think in rows.
- **Where it runs:** in the backend worker, as a pure engine, with ELK itself in a worker of its own that the composition root starts 1.5 s after the documents are restored, laying out an empty graph to warm it up, so the first arrange waits for neither (on the dev server it took seconds; in the e2e image the first arrange went from about 1 s to 0.4 s) ([[src/shells/web/backend.ts]]). We chose the backend over a client-side worker because the layout rules are an engine (the architecture's `layout` area, reachable by MCP later), not canvas code; and not in the backend worker's own thread because ELK's bundle takes over `self.onmessage` in any worker it loads in, and a long layout would hold up solving. Tests run ELK in-process (`elk.bundled.js`).
- Tests: no overlaps and fewer crossings than a scrambled start on the canonical scenes (and no more than their hand-made layout), producers left of consumers, frames holding their nodes, and a property test over random graphs with frames, notes and locked nodes ([[src/engines/layout/arrange.test.ts]]); [[e2e/qol-arrange.spec.ts]] runs it in the app.

**Moves glide.** Whenever the document moves nodes the canvas didn't move itself (arranging, aligning, undoing a move), they glide to their new place: `--duration-base` for short moves, `--duration-slow` for long ones, instantly with reduced motion ([[src/client/canvas/model/tween.ts]]). Moves the canvas made itself (a drop, a nudge) are remembered until the document confirms them, so a quick burst of nudges never pulls a node back.

**New nodes land clear.** A node added from the recipe picker or quick-add goes to the nearest spot, in grid steps, that keeps a grid step clear of every other node (frames aside) ([[src/client/canvas/model/free-spot.ts]]). Quick-add centres it in the visible canvas first.

### Selecting, snapping and nudging on the canvas

| Gesture | Does |
| --- | --- |
| Drag on empty canvas | Box selection; it takes every node it touches |
| `Alt`-drag on empty canvas | Lasso; it takes the nodes whose centre it encloses (frames are left out) |
| `Shift` with either, or `Shift`-click | Adds to the selection |
| Scroll, middle- or right-drag, `Space`-drag | Pan |
| `Ctrl`/`⌘`-scroll, pinch | Zoom |
| Arrow keys | Nudge the selection one grid step (24); `Shift` four steps; `Alt` one unit. One edit per press |
| `F` / `Shift+F` | Zoom to fit (clear of the side panels) / to the selection, animated with `--duration-slow` (none with reduced motion). Both are in the command palette |

While a node is dragged ([[src/client/canvas/model/snap.ts]], [[src/client/canvas/react-flow/snapping.tsx]]):

- Its left, centre or right line (top, middle or bottom for the other axis) snaps to the same lines of nodes on screen when it comes within 6 screen pixels. Frames and the other dragged nodes don't count.
- It also snaps to **even spacing** among the nodes in its row (or column): centred between its two nearest neighbours, or one more step of the gap between the two neighbours on one side. Both equal gaps are marked with ticks and their size.
- Otherwise it snaps to the grid. The nearest candidate wins, so a node never jumps more than 6 pixels or half a grid step.
- Nodes dragged along with it move by the same amount. Accent lines show every alignment that holds after the snap. `Alt` while dragging places freely.
- React Flow's own delete key stays off: deleting is the Edit commands' job (below), so nothing disappears only on screen.
- Edge styles (orthogonal or smooth), reroute points (double-click an edge), and bundled edges for main buses.

## Clipboard and ghost placement

- Copy, cut, paste and duplicate (`Ctrl+C/X/V/D`). A paste doesn't drop nodes immediately: it shows a **ghost**, a translucent copy that follows the cursor with live snapping and guides. Click to place it, or press `Esc` to cancel.
- Edges inside the selection are kept. **Paste with connections** (`Ctrl+Shift+V`) reconnects edges to the original outside nodes when pasting into the same document.
- Works across documents and into or out of subgraphs. The clipboard also holds plain text (JSON), so you can paste a setup into Discord and someone else can paste it back. Pasting between different packs warns about ids that don't exist.
- The same ghost renderer is used for blueprints dragged from the library and for MCP proposals ([[Architecture/MCP server]]).

### How copy and paste work

| Command | Shortcut | Does |
| --- | --- | --- |
| Copy | `Ctrl+C` | Copies the selected nodes (says "Copied 5 nodes"). Text selected on the page outside a field is copied as text instead |
| Cut | `Ctrl+X` | Copies them, then deletes them and the selected flows: one edit, "Cut 5 nodes" |
| Paste | `Ctrl+V` | The copy as a ghost to place (below); placing it is one edit, "Paste 5 nodes" |
| Paste with connections | `Ctrl+Shift+V` | The same, and the pasted nodes get the flows the originals had to nodes outside the copy, when pasting into the graph they came from (and those nodes are still there) |
| Duplicate | `Ctrl+D` | A ghost of the selected nodes two grid steps beside them, leaving the clipboard alone; "Duplicate 5 nodes". Browsers bookmark the page with `Ctrl+D` but let a page take the key, as Figma does |

All of them are in the palette and the app menu; the node's context menu offers copy, cut and duplicate, the canvas's paste. In text fields the keys stay the field's own.

- **The payload** is `Clipboard` ([[src/contracts/clipboard.ts]]): the format and version, the source pack (id and version), where it was copied from (document and graph), the copied nodes with the flows among them, their positions (with size, lock and tag), and the flows to nodes outside the copy (`connections`). `editing.copy` makes it, `editing.paste` places it; the rules are in [[src/engines/editing/clipboard.ts]].
- **Pasting** adds the nodes `offset` from where they were, under fresh ids that keep the readable stem of the copied ones (`smelter-3fa9c1` → `smelter-8b2e40`) and never clash with the graph's; flows get fresh ids too. Nodes the graph can't hold are left out with their flows, and a toast names them: subgraph ports outside a subgraph, subgraphs the factory doesn't have (blueprints don't travel with a copy yet, [[CARB-90]]), a subgraph pasted into itself. Property tests: a paste never reuses an id, never leaves a flow without its nodes, copies nodes and flows faithfully, connects outside only with connections in its own graph, and undoing it restores the document ([[src/engines/editing/clipboard.properties.test.ts]]).
- **The system clipboard** gets the copy as compact JSON text. Browsers only let a page write it during a key press, and a copy takes a round trip to the backend, so the write starts with the key as a `ClipboardItem` whose text is a promise (Safari requires this; `writeText` is the fallback). Pasting reads the system clipboard first (another tab, window or a chat), and falls back to this tab's last copy when it holds anything else or the browser won't let the page read it ([[src/client/features/clipboard/]]).
- **Across packs**, the paste warns as the ghost appears: "These nodes come from the factorio pack: 1 recipe and 1 belt don't exist in satisfactory and will show as missing" (or that everything exists, when nothing is missing). It still pastes; the nodes show their ids until the right pack is used.
- **Placing:** the ghost starts under the pointer (duplicates: beside the originals) and follows it in grid steps, snapping into line with neighbours like a dragged node ([[Design]], Ghosts). The pasted block keeps its own arrangement, and its top-left corner lands on the grid. The new nodes are selected once they're on the canvas. Switching documents or graphs drops a paste waiting there.
- Tests: [[e2e/qol-clipboard.spec.ts]] (copy, paste, connections, cut, duplicate with the keyboard, another tab, another pack, text fields, the snapping ghost in dark and light) and the canonical scene `ghost-paste`.

## Editing

- Drop a node onto an edge to insert it. **Delete & bridge** (`Ctrl+Shift+Del`) removes a node and keeps the flow connected. `Alt`-drag the end of an edge to move it to another port.

### Deleting, bridging, inserting and rewiring

| Gesture | Does | Edit |
| --- | --- | --- |
| `Delete` (or `Backspace` on the canvas) | Deletes the selected nodes with their flows, and the selected flows | `removeNodes` + `disconnect`, one step "Delete" |
| `Ctrl+Shift+Del` (`Ctrl+Shift+Backspace` on the canvas) | **Delete & bridge**: deletes the selected nodes and keeps the flow connected | `removeAndBridge`, one step |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo the last edit of the document on screen. A text field keeps its own undo | `editing.undo` / `editing.redo` |
| Drag a node without flows onto a flow | The flow turns accent while the node would fit; dropping splices the node in | `disconnect` + two `connect` + `moveNodes`, one step "Insert …" |
| `Alt`-drag the end of a flow | While `Alt` is held, the ends of flows can be picked up (they show as rings); dropping one on another port of the same item moves the flow there | `disconnect` + `connect`, one step "Rewire" |

- **Bridging** ([[src/engines/editing/commands.ts]], `removeAndBridge`): per item, every flow into the removed nodes is connected to every flow out of them with the same item, through chains of removed nodes too (a merger into a splitter becomes all sources to all destinations). A recipe whose inputs differ from its outputs has nothing to bridge, so it's simply removed. Bridges keep the outer ports, keep the belt where both sides used the same one, never duplicate a flow that already exists and never connect a node to itself. They are named after the two flows they join (`in+out`), so the engine stays pure.
- **Inserting** ([[src/client/canvas/model/insert.ts]]): a node fits a flow when it takes the flow's item and passes on something the consumer takes, the same item if it can (a junction, a buffer) or else what it makes (a wire machine dropped onto a plates flow that ends in a wire consumer). The flow's belt carries on where the item stays the same. Only a single node without flows of its own is inserted; anything else is just moved. Flows that loop back (below their nodes) aren't targets.
- **Rewiring** keeps the flow's belt and share; it only moves a flow to a port of the same item.
- Deleting a node whose flows are selected too deletes those flows once, with the node.

### More editing

- **Multi-select editing:** change the recipe, clock, modules or belt tier of every selected node at once.
- **Find** (`Ctrl+F`) items, recipes and nodes across the whole factory, including inside subgraphs, and jump to them. **Replace recipe everywhere.**
- **Balance:** fit a node's machine count to downstream demand or upstream supply. **Round to buildable** switches between "4 × 100% + 1 × 37.5%" and "5 × 87.5%".
- Lock nodes; group frames (colour, label, collapsible); sticky notes; colour tags.
- Units per document: /s, /min, /h, or **belts** ("2.0 × Mk.3 belt").

### Find and multi-select editing

- **Find** (`Ctrl+F`, "Find in factory"): a bar over the canvas lists every node matching all the words typed, across the root graph and every subgraph ([[src/client/features/find/find.ts]]): recipes by name, id, building and the names and aliases of the items they take and make; sources, sinks and ports by item; notes by text, frames by label, subgraph instances by blueprint name. `↑↓` move, `Enter` jumps (selects the node and zooms to it, `--duration-slow`; the bar stays, to step through), `Esc` closes. Nodes inside subgraphs are listed with where they are but can't be jumped to until subgraphs open on the canvas ([[CARB-39]]).
- **Replace recipe everywhere**: when the highlighted result runs a recipe, the bar offers the recipes with the same main product; picking one swaps it in every graph, and drops the flows of items the new recipe neither takes nor makes, in one edit. A recipe's main product is its first output, unless it takes apart something whose recipe is for making it from that output: Motor Recycling gives gears back first, but motors are made from gears, so it's no alternative for gears ([[src/client/features/find/find.ts]]). Multi-select editing's *Recipe* uses the same rule.
- **Multi-select editing** (selection toolbar): *Recipe* swaps every selected machine to a recipe they could all run (same main product); *Belt* puts the selected flows and the flows of the selected nodes on a belt or pipe (only flows of the items it carries) or removes the limit. Clock and modules wait for plugin fields in the inspector ([[CARB-41]]).
- New commands: `setRecipe` (keeps fields and pins; drops a building the caller doesn't name) and `setLogistics`.

### Organising: notes, frames, tags

| Command | Shortcut | Does |
| --- | --- | --- |
| Add note | `N` | A sticky note in the middle of the view, clear of the other nodes |
| Frame selection | `Shift+G` | A frame around the selected nodes: a grid step of room, two above for the label |
| Tag red … purple, Remove tag | — (selection toolbar, palette) | A colour tab on the top edge of the selected nodes (`setTag`; stored on the position, like the lock) |

- **Edit in place:** double-click a note (or a frame's label) to edit it; `Ctrl+Enter` in a note or `Enter` in a label, or clicking away, keeps it (`setText`), `Escape` drops it. Keys typed there stay in the field.
- **Resize** a selected note or frame by its handles; the new size is one edit when you let go. Locked ones don't show handles.
- Tag colours are hues on the item-tint scale (canvas.css), so they work in both themes. Frames still take their tint from `tone`.
- Not done yet: collapsing frames.

### Navigating: bookmarks, back and forward

| Command | Shortcut | Does |
| --- | --- | --- |
| Bookmark this view | `Shift+B` | Saves the view in the first free of nine slots (slot 1 again once all are taken) and says which |
| Go to bookmark 1–9 | `1` … `9` | Glides there |
| Back / Forward | `Ctrl+[` / `Ctrl+]` | Through the places you looked at, like a browser ([[src/client/canvas/model/navigation.ts]]) |

- A view that came to rest counts as a new place when it moved by a third of the screen or zoomed by a fifth; smaller moves only update where you are, so back returns to where you were before each jump. Zoom to fit, jumps from find and bookmarks count too.
- Kept per document for the session (they don't go into the file).
- The spec's `Ctrl+1…9` are taken by browsers for their tabs, so bookmarks use the plain digits; the shortcut editor ([[CARB-56]]) can change them.

### Balance and units

- **Fit to demand / Fit to supply** (inspector, on a machine): pins the machine count that makes exactly what the consumers downstream want of its main product, or that the producers upstream can keep busy ([[src/client/shell/inspector/balance.ts]]). Both work from the latest solve: a consumer wants what it takes less what reaches it from elsewhere, a sink with a target wants its target, a producer can spare what it makes less what it sends elsewhere, a source its limit; junctions pass both through. A machine's rate is its solved rate per machine (so plugin modifiers count), or the pack's recipe when it's idle. Each button shows its count and is off when nothing sets one (no consumer that wants a set amount, no limited supply).
- **Rates in belts**: the units picker in the canvas's bottom-right corner (and the "Show rates …" commands) chooses /s, /min, /h or one of the pack's belts and pipes. With a belt, the rates of the items it carries read as multiples of its capacity ("1.47 × Conveyor"); other items keep the rate unit. "Show rates in belts" picks the fastest solid carrier. Stored as `settings.belt` next to `settings.rateUnit` ([[src/client/canvas/model/format.ts]]).
- Sources and sinks put a rate in belts on a line of its own, out of their limit or target when they have one ("0.73 of 1 × Conveyor", with the target's bar below), so neither it nor the item's name is cut short.
- **Round to buildable** (the toggle next to the units, or the command): machine counts read "5 × 87.5%" (every machine at the same clock) instead of "4 × 100% + 1 × 37.5%", on the cards and in the inspector's subtitle. A document setting (`settings.machineGroups`): one choice per factory.
- Both settings change through the `setSettings` command, so they're undoable. The inspector's number fields keep the rate unit.

## Navigation

- Zoom to fit or to the selection (`F` / `Shift+F`), minimap, viewport bookmarks (`Ctrl+1…9`), breadcrumbs, and back/forward like a browser.
- Hover tooltips break a port's rate down by connection. Holding `Alt` while hovering highlights a node's whole upstream and downstream chain.

## General

Context menus everywhere, customisable shortcuts with a cheat sheet (`?`), export to PNG/SVG, and autosave.

- **Cheat sheet and shortcut editor** (`?`, "Keyboard shortcuts"; [[src/client/features/shortcuts/cheat-sheet.tsx]]): every command of the registry by group, with a filter. *Change* records the next key press ([[src/client/features/shortcuts/custom.ts]] writes it the way the registry reads shortcuts; `Escape` cancels); a shortcut another command has is refused with its name. Shortcuts can be removed and reset. The choices are kept in the browser's local storage until the preferences access component exists; the app's registry follows them live (`customisableRegistry` in [[src/client/features/shortcuts/store.ts]]), and if saved choices ever clash with the registered shortcuts (an update gave a command that key), the registered ones win so the app always starts.
- **Context menus** ([[src/client/canvas/context-menu.tsx]]): right-click a node, a flow or empty canvas, or press `Shift+F10` or the menu key. A node or flow outside the selection becomes the selection first. The items are registered commands, so titles, icons and shortcuts match the palette. The menu opens when the right button comes up without having moved, so a right-drag still pans everywhere (on Linux and macOS the browser fires `contextmenu` on the press).
- **Export picture** (PNG or SVG, File group and the canvas's context menu): the whole graph with a margin, at real size up to 8192 px on the longest side ([[src/client/canvas/model/image-frame.ts]]), on the canvas colour, via `html-to-image`. Culling pauses while the picture is taken, so nodes off screen are in it too. Named after the factory.
