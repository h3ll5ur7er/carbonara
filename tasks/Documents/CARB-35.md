---
id: CARB-35
title: Open, switch and close documents
type: feature
status: done
priority: high
labels: [managers, documents]
wave: "1"
milestone: "M1 It flows"
---

The `workspace` manager: new, open, save, close, tabs, recent documents, share links.

**Done when** use-case tests and an e2e test cover the tab workflow and a share link round-trip.

- [x] Use-case tests
- [x] Tabs (the list of open documents; closed documents leave the autosave)
- [x] Share links (compressed)

Built in [[src/managers/workspace.ts]] (use-case tests in [[src/managers/workspace.test.ts]]) and [[src/access/documents/share-links.ts]]. [[e2e/documents.spec.ts]] runs the tab workflow (import, close, reload restores the open ones from IndexedDB), a share link round trip, and the read model following edits, undo and redo ([[CARB-33]]) in the browser, through a real backend worker. See [[Architecture/Documents]] (Workspace).

Decisions:

- **Contract changes** (in [[src/contracts/managers.ts]]): `importDocument` takes `{ bytes: Uint8Array }` instead of `{ text }`, `exportDocument` returns `Uint8Array` instead of `string` (`.carbonara` files are gzipped, see [[CARB-34]]), and two methods are new: `createShareLink({ documentId }) → string` and `openShareLink({ fragment }) → Result<DocumentInfo>`.
- A share link is the `.carbonara` file in base64url, the whole fragment. The client decides how it sits in the URL (`#<fragment>`); the UI that opens a link on load comes with the tabs UI.
- Opening a document whose id is already open gives a copy with a new id.
- `createDocument` needs the pack's version and hash, so the manager depends on `PackStore`. The web backend has a stand-in with no packs until [[CARB-25]]; then `createDocument` works in the app.
- Recent documents are left out: no contract method or UI asks for them yet, and closing a document deletes its autosave. They need their own task (a list of recently closed documents kept in storage), planned with the tabs UI.
- The dev server now scans the backend worker and the read model for dependencies at startup ([[vite.config.ts]]); otherwise it found immer and fflate on first use and reloaded the page, which broke e2e tests on a cold start.
