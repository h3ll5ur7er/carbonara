---
id: CARB-32
title: Edit documents with undoable commands
type: feature
status: todo
priority: urgent
labels: [engines, documents]
wave: "1"
milestone: "M1 It flows"
---

The `editing` engine: pure graph commands (add, connect, move, delete, set fields) producing Immer patches and inverse patches.

**Done when** property tests show `undo(do(x)) = x` for random command sequences and commands reject invalid edits as values.

- [ ] Property tests first
- [ ] Commands
- [ ] Patches + inverse patches
