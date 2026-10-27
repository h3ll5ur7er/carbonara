---
id: CARB-70
title: Show document tabs and open share links
type: feature
status: todo
priority: high
labels: [documents, ui]
wave: "1"
milestone: "M1 It flows"
---

The workspace manager and the read model exist ([[CARB-33]], [[CARB-35]]), but the top bar still shows a placeholder tab and nothing in the UI uses the read model. Connect them.

**Done when** the top bar shows the open documents as tabs (new, switch, close, rename), the canvas renders the active document from the read model, and opening the app with a share-link fragment opens that document (e2e).

- [ ] React hook/provider for the read model (`useDocument(documentId)` etc.)
- [ ] Tabs in the top bar from `listDocuments` + `documentsChanged`
- [ ] New document dialog (pick a pack)
- [ ] Open `location.hash` share links on load; "Copy share link" action
- [ ] Import / export `.carbonara` via file dialogs
- [ ] Show autosave restore problems as a toast
