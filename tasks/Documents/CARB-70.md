---
id: CARB-70
title: Show document tabs and open share links
type: feature
status: in-progress
priority: high
labels: [documents, ui]
wave: "1"
milestone: "M1 It flows"
---

The workspace manager and the read model exist ([[CARB-33]], [[CARB-35]]), but the top bar still shows a placeholder tab and nothing in the UI uses the read model. Connect them.

**Done when** the top bar shows the open documents as tabs (new, switch, close, rename), the canvas renders the active document from the read model, and opening the app with a share-link fragment opens that document (e2e).

- [x] React provider and hooks for the read model and the workspace model ([[src/client/core/models.tsx]])
- [x] Tabs in the top bar from `listDocuments` + `documentsChanged`; switching and closing ([[src/client/features/documents/document-tabs.tsx]])
- [x] New document dialog: name + game pack
- [x] Welcome on the canvas when nothing is open
- [x] Open `#doc=…` share links on load; "Copy share link"
- [x] Open / save `.carbonara` via file dialogs (`Mod+O`, `Mod+S`)
- [x] Show autosave restore problems as a toast (new `workspace.getRestoreProblems`)
- [ ] The canvas draws the active document from the read model — waits for the Canvas epic ([[CARB-16]])
- [ ] Rename a factory — needs a contract method; not started

**Decisions**

- The client keeps a small **workspace model** ([[src/client/core/workspace-model.ts]]): the open documents follow `documentsChanged`, and which tab is active is client state. Closing the active tab activates the tab that takes its place, or the new last one.
- `AppShell` moved to [[src/client/shell/app-shell.tsx]]; the live app ([[src/client/live-app.tsx]]) and the scenes both render it. The top bar takes the tabs as a slot, so scenes keep their static tab.
- File commands live in the command registry like every other action. Browsers keep `Mod+N`/`Mod+W` for themselves and Alt changes `event.key` on macOS, so new/share/close are `Mod+Shift+F/E/X` until shortcuts are customisable ([[CARB-56]]).
- Share links in the address bar are `#doc=<fragment>`, so the fragment can carry other things later.
