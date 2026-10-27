---
id: CARB-33
title: Run commands through the editing manager
type: feature
status: todo
priority: urgent
labels: [managers, documents]
wave: "1"
milestone: "M1 It flows"
---

The `editing` manager: command pipeline, history with labels (incl. "AI: …" for MCP calls later), undo/redo, and `documentChanged` events with patches to the client and to `analysis`.

**Done when** use-case tests cover command → event → undo, and the client read model stays in sync in an e2e test.

- [ ] Use-case tests
- [ ] History + labels
- [ ] Events
- [ ] Client read model applies patches
