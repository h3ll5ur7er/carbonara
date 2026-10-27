---
id: CARB-52
title: Insert on edge, delete & bridge, rewire
type: feature
status: review
priority: medium
labels: [qol]
wave: "2"
milestone: "M2 It's a game"
---

Drop a node onto an edge to insert it; delete & bridge; Alt-drag an edge end to another port.

**Done when** each has engine tests and an e2e test.

- [x] Commands with tests: `removeAndBridge` in the editing engine (unit and property tests); inserting is `disconnect` + `connect` + `moveNodes` built by [[src/client/canvas/model/insert.ts]] (unit tests), rewiring `disconnect` + `connect`
- [x] Interactions: insert target highlighted while dragging, Alt shows the flows' ends, `Delete`/`Backspace`, `Ctrl+Shift+Del`
- [x] Plain delete of selected nodes and flows as one undoable edit (React Flow's delete key stays off)
- [x] Undo/redo commands (`Ctrl+Z`, `Ctrl+Shift+Z`) that leave text fields their own undo (`inTextFields: false` in the command registry)
- [x] e2e: [[e2e/qol-editing.spec.ts]]

Rules: [[Design/Editor quality of life]] (Deleting, bridging, inserting and rewiring).

Inserting needs to know which ports a node has, which only the canvas knows (the engine has no pack), so its rule lives in the canvas model rather than the editing engine; it emits ordinary commands.
