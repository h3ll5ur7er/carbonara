# Documents

A document is one factory plan: a graph of nodes and edges, the blueprints its subgraph instances use, and where everything sits on the canvas. It's saved as a `.carbonara` file (gzipped JSON), autosaved, and shared as a link. The contract is [[src/contracts/document.ts]]; a document using every node kind is [[src/contracts/document.fixture.ts]].

[TOC]

## Structure

```yaml
format: carbonara
version: 1
id: doc-1
name: Iron
pack: { id: satisfactory, version: 1.2.0, hash: sha256-… }   # the pack it was planned with
graph:                                  # the root graph
  nodes: { <id>: <node>, … }
  edges: { <id>: <edge>, … }
blueprints:                             # subgraph definitions, see Subgraphs
  <id>: { name: Iron rods, graph: { nodes, edges } }
layout:                                 # positions, per graph: `root` or a blueprint id
  root: { <node id>: { x, y, width?, height?, locked?, tag? } }
settings: { rateUnit: per_minute, belt?: conveyor-2, machineGroups?: even }   # how rates and machine counts read
```

Nodes and edges are maps keyed by id, not arrays. That keeps patch paths stable (`graph/nodes/smelt/fields/clock`) for undo, events and MCP tools.

**Positions live in `layout`, not on the nodes**, so moving a node never touches the logical graph and never triggers a re-solve.

## Node kinds

| Kind | Fields | Meaning |
| --- | --- | --- |
| `recipe` | `recipe`, `building?`, `fields?`, `pin?` | Machines running a recipe. `fields` holds the plugin's node fields (clock, modules …) |
| `source` | `item`, `maxPerSecond?` | Where an item enters the graph: a resource or an import |
| `sink` | `item`, `targetPerSecond?` | Where an item leaves: a goal or an export |
| `junction` | — | Splits and merges flows. Splitters, mergers and bus segments are all junctions |
| `instance` | `blueprint` | A placed blueprint; its ports are the blueprint's `port` nodes |
| `port` | `direction`, `item` | A blueprint's boundary (only inside blueprints) |
| `note` | `text` | A sticky note |
| `frame` | `label`, `tone?` | A group frame; its size is in `layout` |

**Pins** are values the solver must meet exactly: `{ type: machines, count }` or `{ type: rate, item, perSecond }`.

## Edges

`{ from, to, item, fromPort?, toPort?, logistics?, ratio? }`. Most nodes connect by item; instance nodes connect through a port (the id of the blueprint's port node). `logistics` is the belt or pipe tier and caps the flow at its capacity; `ratio` fixes the edge's share of the source node's output of that item.

## Units

Documents and the solver IR store every rate in **items per second**. Packs state capacities in their own unit (`units.rate`), and the compiler converts them on load. The document's `settings.rateUnit` (or the pack's unit) only affects what the UI shows. One internal unit means no conversion bugs between layers. The rational display ([[Architecture/Solver]]) hides float noise such as 20/min = 0.333… /s.

## Editing

Documents change only through `Command`s ([[src/contracts/commands.ts]]) sent to `editing.apply`. The `editing` engine ([[src/engines/editing/commands.ts]]) applies a batch of commands as one step and returns the new document with the Immer patches that redo it and the inverse patches that undo it. It is pure: the manager chooses the ids of new nodes and edges before calling it.

| Command | Does |
| --- | --- |
| `addNode` | Adds a node and its position |
| `removeNodes` | Removes nodes, their positions and every edge that touches them |
| `removeAndBridge` | Removes nodes like `removeNodes` and keeps the flow connected: per item, each flow into them is joined to each flow out of them (rules on [[Design/Editor quality of life]], Deleting, bridging, inserting and rewiring). New edges are named `<in>+<out>` (with `~2` … when taken), so the engine stays pure |
| `connect` / `disconnect` | Adds an edge / removes edges |
| `moveNodes` | Replaces positions (the whole `Position`, so callers keep `width`, `height` and `locked`) |
| `setNodeFields`, `setPin` | A recipe node's plugin fields, its pin |
| `setRate` | A source's limit or a sink's target |
| `setText` | A note's text or a frame's label |
| `setTag` | Gives nodes a colour tag (`tag` on their position, created at the origin if missing), or removes it |
| `setRecipe` | Swaps the recipe of recipe nodes, keeping fields and pins; a building not named is dropped (the recipe's first applies). Flows it can't take stay: callers remove them in the same batch |
| `setLogistics` | Sets or clears the belt or pipe tier of flows |
| `setSettings` | The document's display settings (`rateUnit`, `belt`, `machineGroups`); null puts one back to its default. It names no graph |
| `setLocked` | Locks nodes in place (`locked: true` on their position, which it creates at the origin if missing) or unlocks them |
| `collapse` | Collapses nodes into a subgraph: a new blueprint holds them, an instance takes their place ([[#Collapse and expand]]) |
| `expand` | Puts a copy of an instance's blueprint in its place and reconnects its flows; the last instance of a blueprint dissolves it |
| `renameBlueprint` | A blueprint's name. It names no graph |
| `renameDocument` | The document's `name` (trimmed, 1 to 120 characters). It names no graph. The workspace re-announces the tabs when a name changes, undo included |

A batch is all or nothing. The engine rejects it, as a value with the path of the offending command (`["commands", 1, "edge", "from"]`), when a command:

- names a graph that doesn't exist (`root` or a blueprint id), or a node or edge that doesn't exist in it;
- adds a node or edge under an id that is taken;
- adds a `port` outside a blueprint, an `instance` of an unknown blueprint, or a blueprint into itself (directly or through other blueprints);
- connects through a port that the node doesn't have (only instances have ports: `fromPort` must be an `out` port of the blueprint, `toPort` an `in` port);
- sets fields or a pin on anything but a recipe node, or a rate (`setRate`: a source's limit, a sink's target) on anything but a source or sink.

Removing nodes also removes their positions and every edge that touches them; removing a blueprint's port node also removes the edges that reach that port through the blueprint's instances. Property tests check that `undo(do(x)) = x` for random command sequences and that no edge or position is ever left dangling.

### Collapse and expand

The rules live in [[src/engines/editing/subgraphs.ts]]. `collapse({ graph, ids, name, blueprint?, instance?, bounds? })`:

- The selected nodes (not ports: they belong to the graph's own boundary) move into a new blueprint under their own ids, with their positions and the flows between them. The instance goes where the selection's top-left corner was.
- **Ports are inferred** from the flows that crossed the selection. Each crossing flow is cut in two at a port: the half outside runs to (or from) the instance's port, the half inside from (or to) the port node. Flows of one item between one node outside and several inside (or several outside and one inside) **share a port**: the shared side gets one flow, named after the first, with their belt if they all had the same one. A share (`ratio`) stays on its source's half, so flows whose shared half would be the source's and that carry a share keep ports of their own. Port nodes are named `in-<item>` / `out-<item>` (`~2` when taken) and laid out beside the nodes, inputs left and outputs right; `bounds` (where the client draws the nodes) places them, or else the positions do.
- The manager names the blueprint and the instance (random UUIDs) unless the command does; ids are the caller's choice so that the engine stays pure.

`expand({ graph, id })` is its inverse: the blueprint's nodes (not its ports) are copied in place of the instance, moved so that their top-left corner is where the instance is, with ids that clash renamed (`~2`). At each port, every flow that reached it outside is joined with every flow that left it inside: when one side had a single flow, the other side's flows keep their ids and belts; otherwise the joined flows are named `<outside>+<inside>`. A flow from an input port straight to an output port joins the flows outside both. When no instance of the blueprint is left in any graph, the blueprint and its layout are removed, so expanding what a collapse made gives back exactly the document before it (a property test over random documents and selections checks `expand(collapse(x)) = x`).

The `editing` manager ([[src/managers/editing.ts]]) runs the use case:

- It gives new nodes and edges without an id a random UUID, applies the batch through the engine and saves the result in the `DocumentStore`, which raises the document's version by one.
- It keeps an undo and a redo stack per document. One `apply` batch is one step, named by the caller's `label` or after its commands ("Move nodes"). A new edit clears the redo stack; closing a document (`documentsChanged` without it) drops its history.
- It publishes `documentChanged` with the patches, the new version and the label (`Undo Move nodes` for an undo, whose patches are the step's inverse patches). A rejected batch changes nothing and publishes nothing.
- `editing.arrange({ documentId, graph, direction, nodeIds?, shapes })` asks the `layout` engine for new positions and applies them as one `moveNodes` step labelled "Arrange", keeping each position's other fields. ELK runs asynchronously, so it moves only the nodes that still exist (and aren't locked) when it's done. The rules are on [[Design/Editor quality of life]] (Auto-arrange and lock).

## Read model

The client mirrors the documents it shows in a zustand store ([[src/client/core/read-model.ts]]). `open(documentId)` loads a snapshot with `editing.getDocument`, which returns the document *with its version*; from then on each `documentChanged` event with the next version is applied as Immer patches. Events the snapshot already includes (an older or equal version) are skipped, and a gap (a missed event) reloads the snapshot, because patches only apply to the version they were made from. Documents closed in the workspace are dropped.

Because patches keep unchanged parts by identity, components subscribe with the selectors (`selectDocument`, `selectGraph`, `selectLayout`, `selectVersion`) and re-render only when their part changes: moving nodes changes the layout but leaves `selectGraph` returning the same object. A property test drives random edits, undos and redos through the real backend and checks that the read model always equals `getDocument` ([[src/shells/web/backend.test.ts]]).

## Saving

The documents access component ([[src/access/documents/autosave.ts]], [[src/access/documents/files.ts]]) holds the documents open in this session and saves them.

- **Autosave.** The web backend's `DocumentStore` writes each changed document through to IndexedDB in the background, so a reload never loses work. A burst of changes (a drag, a paste) is written once, with its latest state. On start it restores the documents that were open, upgraded to the current version; documents it can't load (from a newer Carbonara) are reported and stay saved, untouched. Closing a document moves it from the open documents to the **recent** ones: a second storage (`carbonara-recent`, each entry `{ closedAt, document }`) that keeps the ten closed last and deletes older ones as newer closes push them out. Reopening one takes it off that list. Every `DocumentStore` keeps the recent list (`recent()`, `takeRecent(id)`); the memory store holds it for the session.
- **Files.** A `.carbonara` file is the document as gzipped UTF-8 JSON. `workspace.exportDocument` returns those bytes (a `Uint8Array`, not a string: gzip is binary, and bytes cross the worker boundary as they are) and `workspace.importDocument` takes them. Reading also accepts plain JSON, so a file someone unzipped and edited by hand opens too. Damaged files are refused as values ("Not a Carbonara document").
- **Share links.** A share link carries the whole `.carbonara` file in the URL fragment, in base64url ([[src/access/documents/share-links.ts]]). The fragment never reaches a server, so nothing is uploaded anywhere. Very large documents make long URLs; there's no size limit yet.
- **Platform port.** IndexedDB hides behind the `KeyValueStorage` port ([[src/contracts/platform.ts]]), implemented for the web by [[src/platforms/web/indexeddb.ts]]; the desktop app by [[src/platforms/tauri/key-value.ts]] (one JSON file per key in the app data folder; see [[Architecture/Desktop]]); Node implements the same port later. Every port implementation passes [[src/contracts/platform.contract.ts]], and every `DocumentStore` (memory, autosaved) passes [[src/access/documents/store.contract.ts]].

Versions count changes within a session: a document restored from autosave or opened from a file starts at version 1.

## Workspace

The `workspace` manager ([[src/managers/workspace.ts]]) owns the set of open documents, which the UI shows as tabs. Which tab is active is the client's business, not the backend's.

| Method | Does |
| --- | --- |
| `createDocument({ name, packId, starter? })` | An empty document for an installed pack, recording the pack's version and hash; with `starter`, a copy of that starter factory of the pack ([[Architecture/Game packs]], Starter factories) |
| `listDocuments()` | The open documents in the order they were opened |
| `importDocument({ bytes })` | Opens a `.carbonara` file (or plain JSON); a `Result`, since files can be broken |
| `exportDocument({ documentId })` | The document as `.carbonara` bytes |
| `closeDocument({ documentId })` | Closes it; it stays among the recent documents. Closing a closed document does nothing |
| `listRecent()` | The recently closed documents, newest first: id, name, pack and when it was closed |
| `openRecent({ documentId })` | Opens a recent document again (as a copy under a new id if one with its id is open); a `Result`, since it may have been pushed out |
| `createShareLink({ documentId })` | The URL fragment (without `#`) that opens a copy of the document |
| `openShareLink({ fragment })` | Opens the document in a fragment; a `Result` |
| `getPreferences()` / `setPreferences({ preferences })` | What the app remembers about the person (see Preferences below); setting changes only the preferences given |
| `getRestoreProblems()` | What went wrong restoring last session's documents (they stay saved); the client shows it once as a toast |

Every change to the set publishes `documentsChanged` with the new list, and so does a rename: the workspace listens to `documentChanged` and announces the list again when a patch touches a document's `name`, so the editing manager stays unaware of tabs. A document opened while one with the same id is open (the same file twice, your own share link) becomes a copy under a new id, so the two edit separately.

### Preferences

The preferences access component ([[src/access/preferences/preferences.ts]]) keeps what the app remembers about the person across sessions in the platform's `KeyValueStorage` (`carbonara-preferences`: IndexedDB on the web, the app data folder on desktop), one key per preference. The shape is [[src/contracts/preferences.ts]], where every preference is optional; a stored value it can't read is ignored rather than failing the rest. Today it holds `tour`, how far the welcome tour got ([[Design]], Welcome and tour). Settings that live in the browser's `localStorage` or in memory (custom shortcuts, theme, panel layout) can move here when they need to follow the person to the desktop app.

## In the client

The client mirrors the workspace in a small **workspace model** ([[src/client/core/workspace-model.ts]]): the open documents (the tabs, following `documentsChanged`) and the active one, which is client state. Closing the active tab activates the tab that takes its place, or the new last one. [[src/client/core/models.tsx]] provides the workspace model and the read model to React (`useWorkspace`, `useActiveDocument`).

The File commands (new, open, save, copy share link, close, rename) are in the command registry, so the palette, the app menu and the keyboard reach them. **Renaming:** double-click a tab, or *Rename factory…* (`F2`) for the one on screen; the tab's name becomes a field, Enter or leaving it renames (one `renameDocument` edit, so `Ctrl Z` undoes it), Escape keeps the old name. **Recent documents:** with no factory open, the welcome screen lists the recently closed ones with their game and when they were closed; clicking one reopens it. A share link in the address bar is `#doc=<fragment>`; opening the app with one opens a copy of the document and removes the fragment from the address bar.

## Versions and migrations

`version` is the document format version. When a stored document is older, the documents access component upgrades it step by step (`MIGRATIONS[n]` turns version n into n + 1, in [[src/access/documents/migrations.ts]]) before parsing it with the current schema. A document from a newer Carbonara is refused with a clear message rather than half-loaded.

To change the format: bump `CURRENT_DOCUMENT_VERSION`, add the migration and its test, and update this page.
