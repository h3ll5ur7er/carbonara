// The client end of the MCP server (docs/Architecture/MCP-server.md). The desktop shell's server forwards each tool
// call to the webview as a `BridgeRequest`; the bridge answers it through the connector, as an ordinary manager call,
// and sends back the tool's view of the value. It hides which tool calls which method and how "active" resolves.
import type { ClientApi, Contracts } from "../../../contracts/managers";
import type { Response, RpcError } from "../../../contracts/rpc";
import type { Transport } from "../../../utilities/rpc";
import { mcpTools, type McpToolEntry } from "./tools";
import { views } from "./views";

/** A tool call from the server, which names the method from its manifest (crates/mcp/manifest.json). */
export interface BridgeRequest {
  id: number;
  tool: string;
  manager: string;
  method: string;
  args?: unknown;
}

export interface McpBridgeOptions<C extends Contracts> {
  /** The pipe to the desktop shell: tool calls come in, answers (the RPC `Response` shape) go out. */
  transport: Transport;
  contracts: C;
  backend: ClientApi<C>;
  /** The document on screen, which tools may name as `"active"`. */
  activeDocumentId(): string | null;
}

type Method = (args: unknown) => Promise<unknown>;

export function startMcpBridge<C extends Contracts>({
  transport,
  contracts,
  backend,
  activeDocumentId,
}: McpBridgeOptions<C>): void {
  const tools = new Map(mcpTools(contracts).map((entry) => [entry.tool, entry]));
  const methods = backend as unknown as Record<string, Record<string, Method>>;

  async function answer({ id, tool: name, manager, method, args = {} }: BridgeRequest): Promise<Response> {
    const fail = (error: RpcError): Response => ({ id, ok: false, error });
    const tool = tools.get(name);
    if (!tool) return fail({ message: `Unknown tool ${name}` });
    if (tool.manager !== manager || tool.method !== method) {
      return fail({ message: `The server's tools are out of date: ${name} calls ${tool.manager}.${tool.method}` });
    }
    const resolved = resolveActive(args);
    if (resolved === null) {
      return fail({ message: "No document is open in Carbonara; open one or name one from list_documents." });
    }
    try {
      const call = methods[manager]?.[method];
      if (!call) return fail({ message: `Unknown method ${manager}.${method}` });
      return { id, ok: true, value: viewOf(tool, await call(resolved)) };
    } catch (error) {
      const { message, issues } = error as Error & Pick<RpcError, "issues">;
      return fail(issues ? { message, issues } : { message: message ?? String(error) });
    }
  }

  /** The arguments with `documentId: "active"` replaced by the document on screen; null when none is. */
  function resolveActive(args: unknown): unknown {
    if (typeof args !== "object" || args === null || !("documentId" in args) || args.documentId !== "active") {
      return args;
    }
    const documentId = activeDocumentId();
    return documentId ? { ...args, documentId } : null;
  }

  transport.listen((message) => void answer(message as BridgeRequest).then((response) => transport.send(response)));
}

function viewOf({ view }: McpToolEntry, value: unknown): unknown {
  return view ? views[view](value as never) : value;
}
