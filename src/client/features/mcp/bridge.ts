// The client end of the MCP server (docs/Architecture/MCP-server.md). The desktop shell's server forwards each tool
// call to the webview as a `BridgeRequest`; the bridge answers it through the connector, as an ordinary manager call,
// and sends back the tool's view of the value. It hides which tool calls which method, how "active" resolves, and
// enforces what the person allowed: tools of a switched-off group are refused, every call is logged, and edits are
// labelled as the AI's in the undo history.
import { z } from "zod";
import type { ClientApi, Contracts } from "../../../contracts/managers";
import type { Response, RpcError } from "../../../contracts/rpc";
import type { Transport } from "../../../utilities/rpc";
import { GROUPS, type McpAccess } from "./access";
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
  /** What the person allows, and where calls are logged. */
  access: McpAccess;
}

type Method = (args: unknown) => Promise<unknown>;

/** Prefixes the labels of edits in the undo history. */
export const AI_LABEL = "AI: ";

export function startMcpBridge<C extends Contracts>({
  transport,
  contracts,
  backend,
  activeDocumentId,
  access,
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
    const document = documentOf(resolved);
    const entry = access.begin({ tool: name, group: tool.group, ...(document && { document }) });
    const refuse = (message: string): Response => {
      access.end(entry, "refused", message);
      return fail({ message });
    };
    const failed = (error: RpcError): Response => {
      access.end(entry, "failed", error.message);
      return fail(error);
    };
    if (!access.allowed(tool.group)) return refuse(switchedOff(tool));
    if (resolved === null) {
      return failed({ message: "No document is open in Carbonara; open one or name one from list_documents." });
    }
    const call = methods[manager]?.[method];
    if (!call) return failed({ message: `Unknown method ${manager}.${method}` });
    try {
      const value = viewOf(tool, await call(labelled(tool, resolved)));
      access.end(entry, "done");
      return { id, ok: true, value };
    } catch (error) {
      const { message, issues } = error as Error & Pick<RpcError, "issues">;
      return failed(issues ? { message, issues } : { message: message ?? String(error) });
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

function switchedOff({ group }: McpToolEntry): string {
  const title = GROUPS.find((entry) => entry.group === group)?.title ?? group;
  return `${title} tools are switched off in Carbonara. Ask the person to allow them in AI access and activity.`;
}

function documentOf(args: unknown): string | undefined {
  if (typeof args !== "object" || args === null || !("documentId" in args)) return undefined;
  return typeof args.documentId === "string" ? args.documentId : undefined;
}

/** Methods that take a `label` get one saying the AI made the change, so the undo history shows it. */
function labelled({ args: schema }: McpToolEntry, args: unknown): unknown {
  if (!(schema instanceof z.ZodObject) || !("label" in schema.shape) || typeof args !== "object" || args === null) {
    return args;
  }
  const label = "label" in args && typeof args.label === "string" ? args.label : "Edit";
  return { ...args, label: `${AI_LABEL}${label}` };
}

function viewOf({ view }: McpToolEntry, value: unknown): unknown {
  return view ? views[view](value as never) : value;
}
