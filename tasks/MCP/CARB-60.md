---
id: CARB-60
title: Serve MCP from the desktop app
type: feature
status: done
priority: high
labels: [mcp, desktop]
wave: "2"
milestone: "M2 It's a game"
---

`rmcp` server in the Tauri shell: Streamable HTTP on localhost with a token, and the `carbonara mcp` stdio bridge ([[Architecture/MCP server]]).

**Done when** a scripted MCP client lists tools over both transports and is rejected without the token.

- [x] Server + token: `crates/mcp`, `serve_http` on `127.0.0.1` behind a per-install bearer token, loopback `Host` and no `Origin` ([[crates/mcp/tests/http.rs]])
- [x] stdio bridge: `run_stdio` forwards to the running app through its connection file ([[crates/mcp/tests/stdio.rs]])
- [x] Forwarding to managers through the connector: `MessageBridge` in Rust, `startMcpBridge` / `attachMcpShell` in the client ([[crates/mcp/tests/message_bridge.rs]], [[src/client/features/mcp/bridge.test.ts]])
- [x] Wire it into the Tauri shell ([[CARB-57]]): [[src/shells/tauri/src-tauri/src/mcp.rs]], [[src/shells/tauri/main.tsx]]

Decisions:

- The bridge message carries the tool name as well as `{manager, method}`: one method can back several tools with different views, and the client checks that the server's manifest still matches its contracts.
- The stdio bridge forwards to the HTTP server instead of serving tools itself, so there is one server, one token check and one set of permissions; a stdio client sees "Carbonara isn't running" until the app is up.
