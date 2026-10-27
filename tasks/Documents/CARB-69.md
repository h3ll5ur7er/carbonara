---
id: CARB-69
title: Reopen recent documents
type: feature
status: done
priority: medium
labels: [documents, ux]
wave: "3"
milestone: "M4 Ship"
---

Closing a document deletes its autosave today ([[CARB-34]]), and nothing lists documents you worked on before. Keep closed documents as "recent" (bounded list) and let the workspace manager list and reopen them.

**Done when** a closed document can be reopened from a recent list after a reload (e2e).

- [x] Contract: `workspace.listRecent`, `workspace.openRecent`
- [x] Documents access keeps a bounded recent list instead of deleting on close (10, in `carbonara-recent`; `DocumentStore.recent` / `takeRecent`, in the contract suite)
- [x] UI entry point: the welcome screen lists them with game and "closed … ago"
- [x] e2e: reopen from the recent list after a reload ([[e2e/tabs.spec.ts]])
