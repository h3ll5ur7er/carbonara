---
id: CARB-19
title: Pick recipes by dragging from a port
type: feature
status: review
priority: high
labels: [canvas, ux]
wave: "1"
milestone: "M1 It flows"
---

Dragging from a port into empty space opens a recipe picker filtered by that item: producers for inputs, consumers for outputs, ranked by use, with alternates previewed side by side.

**Done when** the e2e test drags from an output port, picks a recipe, and finds the new node connected and solved.

- [x] Picker UI with keyboard navigation
- [x] Ranking by use (document usage for now; see below)
- [x] Creates node + edge through `editing`
- [x] e2e test (connected; "solved" waits for the analysis manager, see below)

## Decisions

- Rules are pure and unit-tested in [[src/client/features/recipe-picker/picker.ts]]: entries, ranking, word filter, placement, the command batch, and `applyPick` against a mocked connector. The panel is [[src/client/features/recipe-picker/recipe-picker.tsx]] on `cmdk`, styled like the command palette.
- The renderer reports `onPortDropped` (node, item, port side, drop point) only for drops on the empty pane; the canvas host opens the picker and sends `addNode` + `connect` as one `editing.apply` batch labelled "Add …". The new node gets a client-chosen id (`<recipe>-<random>`) so the batch can connect to it.
- **Ranking by use** counts the recipes' nodes in the open document. The task named the preferences access component, which doesn't exist yet; when it does, cross-document pick counts can feed the same `usage` argument.
- Sources and sinks are offered too: an input of a raw resource gets "… source" first; outputs always end with "… output".
- Refused edits show an error toast (the shell's toasts) instead of being logged.

## Open

- "…and solved": the scene backend applies the edit but nothing solves yet, so the new node shows "Not solved yet". The e2e test checks the node and its edge; once the analysis manager publishes results (CARB-15) and the canvas is wired to them (CARB-70), extend it to check the new node's rates.
