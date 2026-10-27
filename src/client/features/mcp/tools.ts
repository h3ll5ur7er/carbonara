// The MCP tools, derived from the `mcp` metadata of the manager contracts (docs/Architecture/MCP-server.md).
// The manifest generator (tools/mcp-tools.ts) and the bridge both read them from here, so they can't disagree.
import type { z } from "zod";
import type { Contracts, McpTool } from "../../../contracts/managers";

/** A tool and the manager method behind it. */
export interface McpToolEntry extends McpTool {
  manager: string;
  method: string;
  /** The method's argument schema: the tool's input schema. */
  args: z.ZodType;
}

/** Every tool of the contracts, in contract order. Two methods claiming one tool name are a bug, so it throws. */
export function mcpTools(contracts: Contracts): McpToolEntry[] {
  const tools: McpToolEntry[] = [];
  for (const [manager, methods] of Object.entries(contracts)) {
    for (const [method, { args, mcp }] of Object.entries(methods)) {
      if (!mcp) continue;
      for (const tool of "tool" in mcp ? [mcp] : mcp) {
        const taken = tools.find((entry) => entry.tool === tool.tool);
        if (taken) {
          throw new Error(`${manager}.${method} and ${taken.manager}.${taken.method} both claim ${tool.tool}`);
        }
        tools.push({ ...tool, manager, method, args });
      }
    }
  }
  return tools;
}
