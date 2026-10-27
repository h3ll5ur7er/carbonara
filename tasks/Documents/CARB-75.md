---
id: CARB-75
title: Rename a factory
type: feature
status: done
priority: low
labels: [documents, ux]
wave: "3"
milestone: "M4 Ship"
---

Double-click a tab (or a palette command) to rename the factory. Needs an undoable way to change `document.name` that also updates the tab list (`documentsChanged`).

- [x] Contract + engine: `renameDocument` editing command (property-tested with the others)
- [x] Workspace list follows the new name: the workspace announces `documentsChanged` when a `documentChanged` patch touches `name` (undo too), so managers still only talk through events
- [x] Inline rename in the tab: double-click, or "Rename factory…" (`F2`); Enter or blur renames, Escape keeps the name
- [x] e2e: rename, undo, Escape ([[e2e/tabs.spec.ts]])
