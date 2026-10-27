---
id: CARB-33
title: Run commands through the editing manager
type: feature
status: done
priority: urgent
labels: [managers, documents]
wave: "1"
milestone: "M1 It flows"
---

The `editing` manager: command pipeline, history with labels (incl. "AI: …" for MCP calls later), undo/redo, and `documentChanged` events with patches to the client and to `analysis`.

**Done when** use-case tests cover command → event → undo, and the client read model stays in sync in an e2e test.

- [x] Use-case tests
- [x] History + labels
- [x] Events
- [x] Client read model applies patches

Built in [[src/managers/editing.ts]] (use-case tests in [[src/managers/editing.test.ts]]) and [[src/client/core/read-model.ts]] (tests with a fake backend in [[src/client/core/read-model.test.ts]]). Wired into [[src/shells/web/backend.ts]] with the autosaved document store from [[CARB-34]]; [[src/shells/web/backend.test.ts]] drives random edits, undos and redos through the real backend over a message channel and checks the read model against `getDocument`. In the browser, [[e2e/documents.spec.ts]] (added with [[CARB-35]], which can open documents) checks the same through a real backend worker. See [[Architecture/Documents]] (Editing, Read model).

Decisions:

- **Contract change:** `editing.getDocument` returns `OpenDocument` (`{ document, version }`) instead of `Document`. Without the version a client can't tell which `documentChanged` events its snapshot already includes.
- The manager gets `newId` injected (UUIDs in the backend, counters in tests).
- Undo/redo with an empty stack return the document's info unchanged rather than failing; an unknown document throws (the dispatcher reports it), while `apply` returns it as a `Result`, like its other failures.
- Undo/redo events carry `Undo <label>` / `Redo <label>`. No history listing method yet: nothing needs it.
- The read model loads documents explicitly (`open`/`close`); which documents a client mirrors is the tabs UI's call. It doesn't provide a React hook yet: `useStore(readModel.store, selectGraph(id))` works today.
- Fixed in passing: the layer lint rule took `editing.test.ts` for a component other than `editing`, so a top-level manager's test couldn't import it ([[eslint-rules/layers.js]]).
