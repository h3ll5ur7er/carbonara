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
| Arrange top to bottom | — | The same, flowing down (palette and menus) |
| Lock or unlock selection | `Shift+L` | Locked nodes wear a padlock; dragging, nudging and arranging leave them where they are. Unlocks when every selected node is locked |

How arranging works ([[src/engines/layout/arrange.ts]], called by `editing.arrange` in [[src/managers/editing.ts]]):

- **ELK layered** with fixed port positions: the client sends each node's size and port offsets (`shapes`, [[src/contracts/layout.ts]]), because only the canvas knows its geometry. Nodes keep today's reading order where ELK can (`considerModelOrder`), so arranging twice changes nothing and small edits don't reshuffle the factory. Sources start the flow (first layer), even when they feed a loop deep inside it. Network-simplex node placement gives straight runs between ports.
- **Frames move with what they hold.** A frame takes part when it and every node whose centre it holds can move: it becomes a compound node in ELK and is resized around its nodes, with room for its label. Otherwise it stays, and its nodes are arranged like any other. Notes inside a moving frame move with it; notes outside frames stay.
- **What stays put:** locked nodes and the nodes outside the selection. The arranged block keeps the top-left corner of where its nodes were (on the grid) and is pushed clear of the nodes that stay, across the flow.
- It is **one edit** ("Arrange": a `moveNodes` step), so one undo puts everything back.
- **Where it runs:** in the backend worker, as a pure engine, with ELK itself in a worker of its own that the composition root starts on the first arrange ([[src/shells/web/backend.ts]]). We chose the backend over a client-side worker because the layout rules are an engine (the architecture's `layout` area, reachable by MCP later), not canvas code; and not in the backend worker's own thread because ELK's bundle takes over `self.onmessage` in any worker it loads in, and a long layout would hold up solving. Tests run ELK in-process (`elk.bundled.js`).
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
- The same ghost renderer is used for blueprints dragged from the library (Subgraphs, below) and for MCP proposals ([[Architecture/MCP server]]).

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

- **Find** (`Ctrl+F`, "Find in factory"): a bar over the canvas lists every node matching all the words typed, across the root graph and every subgraph ([[src/client/features/find/find.ts]]): recipes by name, id, building and the names and aliases of the items they take and make; sources, sinks and ports by item; notes by text, frames by label, subgraph instances by blueprint name. `↑↓` move, `Enter` jumps (selects the node and zooms to it, `--duration-slow`; the bar stays, to step through), `Esc` closes. Nodes in other graphs (inside a subgraph, or the factory while one is open) are listed with where they are, but jumping there doesn't open the way to them yet ([[CARB-85]]).
- **Replace recipe everywhere**: when the highlighted result runs a recipe, the bar offers the recipes with the same main product (first output); picking one swaps it in every graph, and drops the flows of items the new recipe neither takes nor makes, in one edit.
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
- Kept per document and graph for the session (they don't go into the file): inside a subgraph, back and forward stay inside it.
- The spec's `Ctrl+1…9` are taken by browsers for their tabs, so bookmarks use the plain digits; the shortcut editor ([[CARB-56]]) can change them.

### Balance and units

- **Fit to demand / Fit to supply** (inspector, on a machine): pins the machine count that makes exactly what the consumers downstream want of its main product, or that the producers upstream can keep busy ([[src/client/shell/inspector/balance.ts]]). Both work from the latest solve: a consumer wants what it takes less what reaches it from elsewhere, a sink with a target wants its target, a producer can spare what it makes less what it sends elsewhere, a source its limit; junctions pass both through. A machine's rate is its solved rate per machine (so plugin modifiers count), or the pack's recipe when it's idle. Each button shows its count and is off when nothing sets one (no consumer that wants a set amount, no limited supply).
- **Rates in belts**: the units picker in the canvas's bottom-right corner (and the "Show rates …" commands) chooses /s, /min, /h or one of the pack's belts and pipes. With a belt, the rates of the items it carries read as multiples of its capacity ("1.47 × Conveyor"); other items keep the rate unit. "Show rates in belts" picks the fastest solid carrier. Stored as `settings.belt` next to `settings.rateUnit` ([[src/client/canvas/model/format.ts]]).
- **Round to buildable** (the toggle next to the units, or the command): machine counts read "5 × 87.5%" (every machine at the same clock) instead of "4 × 100% + 1 × 37.5%". A document setting (`settings.machineGroups`): one choice per factory.
- Both settings change through the `setSettings` command, so they're undoable. The inspector's number fields keep the rate unit.

## Subgraphs

How subgraphs work is on [[Architecture/Subgraphs]]; the edits are `collapse`, `expand` and `renameBlueprint` ([[Architecture/Documents]], Collapse and expand). The commands are in the Subgraphs group ([[src/client/features/subgraphs/commands.ts]]) and on a node's context menu.

| Command | Shortcut | Does |
| --- | --- | --- |
| Collapse into subgraph | `Ctrl+G` | The selected nodes (not ports) become a new blueprint, named after the main products that leave them ("Copper Wire line", "Subgraph" when nothing does). Its ports are laid out beside them, inputs left and outputs right; the instance takes the selection's top-left corner and is selected |
| Expand subgraph | `Ctrl+Shift+G` | The selected instances become their nodes again; expanding the last instance of a blueprint dissolves it |
| Open subgraph | `Ctrl+↓` (or double-click, or the card's *Open*) | Dives into the selected instance |
| Leave subgraph | `Ctrl+↑` | Goes up one level |

- **Instances** are drawn like machines, as a stack (a second card peeks out behind): the blueprint's name, its scale ("× 2", how many times it runs as designed; "Sized by its flows" without pins), an *Open* button, then one row per port with its live rate, in the order the ports sit inside. Flows reach an instance through a port: its handles are `in:<item>#<port>` ([[src/client/canvas/model/connect.ts]]), so connecting, the recipe picker and rewiring name the port. An instance isn't spliced into a flow it's dropped on (a splice can't choose its ports).
- **Ports** (inside a blueprint) are pills with a dashed accent edge: an input passes its item on into the blueprint from its right edge, an output takes it in on its left ([[src/client/canvas/react-flow/subgraph-nodes.tsx]]).
- **Opening and leaving** ([[src/client/features/subgraphs/use-subgraph-view.tsx]]): opening zooms into the card until it fills the view (`--duration-slow`), then the blueprint's canvas grows in from 90% (`subgraphs.css`); leaving brings the canvas above back zoomed into the instance, settling in from 104% while the view glides out to where it was. Each level is a canvas of its own: its view, selection, back and forward start afresh.
- **Breadcrumbs** at the canvas's top-left (the bars at the top move down a row while they're there): the up button with the shortcut, the factory and each blueprint above (buttons back to that level), then the blueprint on screen, which a double-click or `F2` renames (`Enter` keeps, `Esc` drops). A chip says when the rates add up several instances.
- **The library** ([[src/client/features/subgraphs/library-panel.tsx]]) lists the document's blueprints by name, each with its port items (inputs → outputs), how often it's placed and how many nodes it holds. Pressing a card picks the blueprint up as a ghost that follows the pointer over the canvas (the ghost renderer's pointer mode): letting go over the canvas after a drag places it there, centred and on the grid like the ghost; a click without a drag keeps it following until the next click on the canvas; `Esc` or letting go anywhere else cancels. `Enter` on a focused card places it mid-view, clear of the other nodes. Cards of blueprints that would contain themselves are disabled. Without blueprints, the panel says how to make one.

## Navigation

- Zoom to fit or to the selection (`F` / `Shift+F`), minimap, viewport bookmarks (`Ctrl+1…9`), breadcrumbs (Subgraphs, above), and back/forward like a browser.
- Hover tooltips break a port's rate down by connection. Holding `Alt` while hovering highlights a node's whole upstream and downstream chain.

## General

Context menus everywhere, customisable shortcuts with a cheat sheet (`?`), export to PNG/SVG, and autosave.

- **Cheat sheet and shortcut editor** (`?`, "Keyboard shortcuts"; [[src/client/features/shortcuts/cheat-sheet.tsx]]): every command of the registry by group, with a filter. *Change* records the next key press ([[src/client/features/shortcuts/custom.ts]] writes it the way the registry reads shortcuts; `Escape` cancels); a shortcut another command has is refused with its name. Shortcuts can be removed and reset. The choices are kept in the browser's local storage until the preferences access component exists; the app's registry follows them live (`customisableRegistry` in [[src/client/features/shortcuts/store.ts]]), and if saved choices ever clash with the registered shortcuts (an update gave a command that key), the registered ones win so the app always starts.
- **Context menus** ([[src/client/canvas/context-menu.tsx]]): right-click a node, a flow or empty canvas, or press `Shift+F10` or the menu key. A node or flow outside the selection becomes the selection first. The items are registered commands, so titles, icons and shortcuts match the palette. The menu opens when the right button comes up without having moved, so a right-drag still pans everywhere (on Linux and macOS the browser fires `contextmenu` on the press).
- **Export picture** (PNG or SVG, File group and the canvas's context menu): the whole graph with a margin, at real size up to 8192 px on the longest side ([[src/client/canvas/model/image-frame.ts]]), on the canvas colour, via `html-to-image`. Culling pauses while the picture is taken, so nodes off screen are in it too. Named after the factory.
