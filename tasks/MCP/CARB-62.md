---
id: CARB-62
title: Control what MCP clients may do
type: feature
status: done
priority: high
labels: [mcp, security]
wave: "2"
milestone: "M2 It's a game"
---

Permission groups (read-only by default), activity panel, "AI: …" history labels, copy-config snippets.

**Done when** disabled groups are refused and every call appears in the activity panel.

- [x] Permissions: read on, plan, edit and authoring off; enforced by the webview's bridge ([[src/client/features/mcp/bridge.test.ts]])
- [x] Activity panel: *AI access and activity* (`Mod+Shift+A`) with the switches and every call ([[src/client/features/mcp/access-dialog.test.tsx]])
- [x] "AI: …" labels on edits in the undo history
- [x] Config snippets for Claude Code, Claude Desktop and other clients, once the desktop shell passes the connection
- [ ] Persist the switches once a preferences store exists (they reset to read-only on every start)

Decisions:

- The bridge in the webview is the only enforcement point: the switches and the log live in the app and every call from both transports passes it; the server stays stateless. Switched-off tools stay listed and are refused with a message telling the model how to get them allowed. Reasons in [[Architecture/MCP server#Permissions and activity]].
