---
id: CARB-61
title: Generate MCP tools from the manager contracts
type: feature
status: review
priority: high
labels: [mcp, contracts]
wave: "2"
milestone: "M2 It's a game"
---

Tools, resources and prompts derived from the manager contracts' MCP metadata, so nothing is duplicated.

**Done when** every tool in the wiki's table exists, with input schemas from zod, and tests call each.

- [x] Generator: `pnpm mcp:tools` writes `crates/mcp/manifest.json`; a test fails when it's out of date
- [x] Read and edit groups for the methods that exist; plan and authoring follow their managers (see the table in [[Architecture/MCP server]])
- [x] Resources + prompts in the manifest
- [x] Tests call each tool through the server and the bridge ([[crates/mcp/tests/http.rs]], [[src/client/features/mcp/bridge.test.ts]])

Decisions:

- `McpTool` gained an optional `view`, and a method's `mcp` may list several tools, so `get_totals` and `get_diagnostics` both come from `analysis.getResults` and `get_graph` can summarise large graphs.
- One `edit_graph` tool maps to `editing.apply` instead of a tool per command type: one source of truth for commands, one undo step per call. Reasons in [[Architecture/MCP server#Tools]].
