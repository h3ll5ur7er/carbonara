// The webview's end of the MCP server in the Rust shell (src-tauri/src/mcp.rs): tool calls arrive as `mcp-call`
// events, answers go back through the `mcp_answer` command. `attachMcpShell` runs the bridge over it.
import type { Invoke } from "../../platforms/tauri/invoke";
import type { Transport } from "../../utilities/rpc";

/** Tauri's `listen`, as far as this needs it. */
type Listen = (event: string, handler: (event: { payload: unknown }) => void) => Promise<unknown>;

export function mcpTransport(invoke: Invoke, listen: Listen): Transport {
  return {
    send: (answer) => void invoke("mcp_answer", { answer }),
    listen: (listener) => void listen("mcp-call", (event) => listener(event.payload)),
  };
}
