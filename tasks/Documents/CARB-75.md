---
id: CARB-75
title: Rename a factory
type: feature
status: backlog
priority: low
labels: [documents, ux]
wave: "2"
milestone: "M4 Ship"
---

Double-click a tab (or a palette command) to rename the factory. Needs an undoable way to change `document.name` that also updates the tab list (`documentsChanged`).

- [ ] Contract + engine: rename as an editing command
- [ ] Workspace list follows the new name
- [ ] Inline rename in the tab
