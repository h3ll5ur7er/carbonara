# Editor quality of life

These features decide whether the editor feels pleasant during a long session. They're first-class scope, not polish. The rules behind them (what a paste keeps, how bridging reconnects) live in the `editing` engine; the `layout` engine does the arranging.

[TOC]

## Layout and alignment

- **Auto-arrange** the whole graph or the selection, left → right (default) or top → bottom. It uses ELK layered layout with ordering that follows the item flow, to keep edge crossings low, and animates to the new positions. Locked nodes stay where they are.
- **Align** left, centre, right, top, middle or bottom. **Distribute** horizontally or vertically. **Straighten chain** lines up a linear chain on one row.
- Snap to grid (hold `Alt` to bypass), smart alignment guides with spacing indicators, and arrow-key nudging (`Shift` for big steps).

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
- React Flow's own delete key is off until delete commands exist, so nothing disappears only on screen.
- Edge styles (orthogonal or smooth), reroute points (double-click an edge), and bundled edges for main buses.

## Clipboard and ghost placement

- Copy, cut, paste and duplicate (`Ctrl+C/X/V/D`). A paste doesn't drop nodes immediately: it shows a **ghost**, a translucent copy that follows the cursor with live snapping and guides. Click to place it, or press `Esc` to cancel.
- Edges inside the selection are kept. **Paste with connections** (`Ctrl+Shift+V`) reconnects edges to the original outside nodes when pasting into the same document.
- Works across documents and into or out of subgraphs. The clipboard also holds plain text (JSON), so you can paste a setup into Discord and someone else can paste it back. Pasting between different packs warns about ids that don't exist.
- The same ghost renderer is used for blueprints dragged from the library and for MCP proposals ([[Architecture/MCP server]]).

## Editing

- Drop a node onto an edge to insert it. **Delete & bridge** (`Ctrl+Shift+Del`) removes a node and keeps the flow connected. `Alt`-drag the end of an edge to move it to another port.
- **Multi-select editing:** change the recipe, clock, modules or belt tier of every selected node at once.
- **Find** (`Ctrl+F`) items, recipes and nodes across the whole factory, including inside subgraphs, and jump to them. **Replace recipe everywhere.**
- **Balance:** fit a node's machine count to downstream demand or upstream supply. **Round to buildable** switches between "4 × 100% + 1 × 37.5%" and "5 × 87.5%".
- Lock nodes; group frames (colour, label, collapsible); sticky notes; colour tags.
- Units per document: /s, /min, /h, or **belts** ("2.0 × Mk.3 belt").

## Navigation

- Zoom to fit or to the selection (`F` / `Shift+F`), minimap, viewport bookmarks (`Ctrl+1…9`), breadcrumbs, and back/forward like a browser.
- Hover tooltips break a port's rate down by connection. Holding `Alt` while hovering highlights a node's whole upstream and downstream chain.

## General

Context menus everywhere, customisable shortcuts with a cheat sheet (`?`), export to PNG/SVG, and autosave.
