# MCP server

The desktop app runs an MCP server, so any MCP client (Claude Desktop, Claude Code and others) can read and edit your factories and help you build packs. The aim is that "create a steel smelting setup that produces 2 full yellow belts" just works.

The MCP server is a **client** in the [[Architecture]] sense: it calls the same managers the UI calls, and nothing else.

[TOC]

## How it's built

- The server is part of the Tauri shell (Rust, `rmcp`). It serves Streamable HTTP on `127.0.0.1` with a per-install token. `carbonara mcp` is a stdio bridge in the same binary for clients that only launch stdio servers. A settings panel offers one-click "copy config" snippets for common clients.
- Each tool call is forwarded to the client's connector and from there, as an ordinary RPC call, to the managers in the backend worker. If the app isn't running, tools return a clear error.
- **Tools are generated from the manager contracts** (DRY): each MCP-exposed manager method carries a description, its zod schema becomes the tool's input schema, and it belongs to a permission group.
- **Edits go through the normal command pipeline:** each tool call becomes one undo step, labelled "AI: …" in the history panel.
- **Proposals instead of surprises:** generative tools don't change the document directly by default. They create a proposal, shown as a ghost overlay with a summary card (machines, raw inputs, power) and *Accept*, *Adjust* and *Discard* buttons. A setting allows edits to be applied directly instead.
- **Permissions:** read-only by default. The *Edit* and *Pack authoring* groups are switched on separately in settings. An activity panel lists every call.

## Tools

| Group | Tools |
| --- | --- |
| Read | `list_packs`, `search_catalog` (items/recipes/buildings), `get_recipe`, `list_documents`, `get_graph` (document, subgraph or selection; summarised for large graphs), `get_totals`, `get_diagnostics` (deficits, overloaded belts, byproducts), `explain_node` |
| Plan | `convert_rate` ("2 full yellow belts" → items/min, using the pack's logistics data and aliases), `plan_production(targets, options)` → proposal, `compare_recipes(item, rate)` |
| Edit | `add_nodes`, `connect`, `set_node_fields`, `replace_recipe`, `create_subgraph`, `auto_arrange`, `apply_proposal`, `undo` |
| Pack authoring | `get_pack_schema`, `get_plugin_api_docs`, `scaffold_pack`, `read_pack_file` / `write_pack_file` (only inside a dev pack folder), `validate_pack`, `reload_dev_pack`, `build_cpack` |

**Resources:** the JSON Schemas, the plugin API reference, and a summary of the active document. **Prompts:** "Design a production line" and "Create a pack for <game>".

## Example

"Steel, 2 full yellow belts":

1. `convert_rate` finds that a yellow belt carries 15/s in the Factorio pack, so the target is 30/s = 1800 steel/min.
2. `plan_production({ steel-plate: 1800/min })` creates a ghost proposal next to the existing factory: 480 steel furnaces (240 smelting iron plate, 240 making steel) and 9000 iron ore/min.
3. You click *Accept*, and `auto_arrange` tidies it up.

## Security

- Bound to `127.0.0.1` only, with a per-install token.
- Read-only by default; edit and authoring tools need separate opt-in.
- File writes are limited to dev pack folders.
- Every call is logged and every edit is undoable.

## Web version

Browsers can't host an MCP server, so the web app has no MCP in v1. A companion relay is a possible later addition.
