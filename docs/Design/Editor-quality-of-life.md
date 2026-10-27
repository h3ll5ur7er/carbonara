# Editor quality of life

These features decide whether the editor feels pleasant during a long session. They're first-class scope, not polish. The rules behind them (what a paste keeps, how bridging reconnects) live in the `editing` engine; the `layout` engine does the arranging.

[TOC]

## Layout and alignment

- **Auto-arrange** the whole graph or the selection, left → right (default) or top → bottom. It uses ELK layered layout with ordering that follows the item flow, to keep edge crossings low, and animates to the new positions. Locked nodes stay where they are.
- **Align** left, centre, right, top, middle or bottom. **Distribute** horizontally or vertically. **Straighten chain** lines up a linear chain on one row.
- Snap to grid (hold `Alt` to bypass), smart alignment guides with spacing indicators, and arrow-key nudging (`Shift` for big steps).
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
