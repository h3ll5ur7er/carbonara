---
id: CARB-60
title: Serve MCP from the desktop app
type: feature
status: backlog
priority: high
labels: [mcp, desktop]
wave: "2"
milestone: "M2 It's a game"
---

`rmcp` server in the Tauri shell: Streamable HTTP on localhost with a token, and the `carbonara mcp` stdio bridge ([[Architecture/MCP server]]).

**Done when** a scripted MCP client lists tools over both transports and is rejected without the token.

- [ ] Server + token
- [ ] stdio bridge
- [ ] Forwarding to managers through the connector
