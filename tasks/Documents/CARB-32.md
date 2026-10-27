---
id: CARB-32
title: Edit documents with undoable commands
type: feature
status: done
priority: urgent
labels: [engines, documents]
wave: "1"
milestone: "M1 It flows"
---

The `editing` engine: pure graph commands (add, connect, move, delete, set fields) producing Immer patches and inverse patches.

**Done when** property tests show `undo(do(x)) = x` for random command sequences and commands reject invalid edits as values.

- [x] Property tests first
- [x] Commands
- [x] Patches + inverse patches

Done in [[src/engines/editing/commands.ts]] (`applyCommands`, `applyPatches`, `describeCommands`), specified by [[src/engines/editing/commands.test.ts]] and the property tests in [[src/engines/editing/commands.properties.test.ts]] (`undo(do(x)) = x`, redo, no dangling edges or positions, documents stay valid). The rules are on [[Architecture/Documents]] (Editing).

Decisions:

- The engine takes a `ResolvedCommand`: a `Command` whose `addNode`/`connect` id is set. The manager chooses ids, so the engine stays pure.
- A batch is all or nothing: the first invalid command rejects it, with the issue path `["commands", index, …]` matching the `editing.apply` arguments.
- Removing a port node inside a blueprint also removes the edges that reach that port through the blueprint's instances in other graphs, so no edge points at a missing port.
- Placing a blueprint inside itself (directly or through other blueprints) is rejected.
