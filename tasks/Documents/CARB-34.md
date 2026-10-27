---
id: CARB-34
title: Save documents locally and to files
type: feature
status: done
priority: high
labels: [access, documents]
wave: "1"
milestone: "M1 It flows"
---

The `documents` access component: IndexedDB autosave, `.carbonara` files (gzipped JSON) through platform ports, migrations on load.

**Done when** the contract tests pass for memory and web implementations and a saved file reopens identically.

- [x] Contract tests first
- [x] Autosave
- [x] File save/open
- [x] Migrations on load

How it's built is on [[Architecture/Documents]] (Saving):

- `DocumentStore` implementations: [[src/access/documents/memory.ts]] and [[src/access/documents/autosave.ts]] (memory + write-through to a `KeyValueStorage`, `restore()` with migrations, `flush()`). Both pass [[src/access/documents/store.contract.ts]].
- Platform port `KeyValueStorage` in [[src/contracts/platform.ts]], its contract suite [[src/contracts/platform.contract.ts]], and the IndexedDB implementation [[src/platforms/web/indexeddb.ts]] (tested with `fake-indexeddb`).
- File format in [[src/access/documents/files.ts]]: `writeDocumentFile` / `readDocumentFile`.

Decisions:

- `.carbonara` files are gzipped bytes, not JSON text: the format the architecture names, smaller, and `Uint8Array`s cross the worker boundary without copying. `workspace.exportDocument` / `importDocument` move to bytes with [[CARB-35]]. Reading accepts plain JSON too.
- Autosave writes on every change, coalesced per document while a write is pending; there's no timer to tune.
- Restored documents that fail to load stay in storage, so a downgrade never destroys a newer document.
- The composition root wires the IndexedDB-backed store and restores before answering requests (with [[CARB-33]]). Problems from `restore()` aren't shown to the user yet; they need a UI.
