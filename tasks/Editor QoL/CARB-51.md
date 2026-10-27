---
id: CARB-51
title: Copy and paste with a ghost preview
type: feature
status: done
priority: urgent
labels: [qol, ux]
wave: "3"
milestone: "M2 It's a game"
---

Clipboard with ghost placement, paste with connections, cross-document and text (JSON) payload, cross-pack warnings ([[Design/Editor quality of life]]). The ghost renderer is shared with proposals and blueprints.

**Done when** paste round-trip property tests pass and the e2e test pastes with a ghost and places it.

- [x] Editing engine: paste semantics (tests first)
- [x] Ghost renderer
- [x] Text payload
- [x] e2e
- [x] Cut, duplicate, paste with connections; context menus
- [x] Canonical scene `ghost-paste`

Decisions ([[Design/Editor quality of life]], How copy and paste work):

- The payload is a contract (`Clipboard`); `editing.copy` and `editing.paste` are manager methods, not MCP tools. The ghost's pointer placement gained an optional `at` (additive).
- Fresh ids keep the copied id's readable stem. The pasted block keeps its arrangement; its top-left corner snaps to the grid (snapping each node would break the port alignment of hand-made layouts).
- `Mod+D` works in Chrome and Firefox (pages may take it); duplicates leave the clipboard alone.
- Instances of blueprints the target lacks are left out with a toast: blueprints don't travel with a copy yet ([[CARB-90]]).
