// Where the desktop shell plugs the MCP server into the client. The shell calls `attachMcpShell` once, before it
// renders the app; `McpHost`, rendered by the live app, tells the bridge which document is on screen and holds the
// "AI access and activity" dialog. Without a shell (the web app) no bridge starts and the dialog says so.
import { useEffect } from "react";
import { managers } from "../../../contracts/managers";
import type { Transport } from "../../../utilities/rpc";
import type { Connector } from "../../core/connector";
import { useModels } from "../../core/models";
import { createMcpAccess } from "./access";
import { McpAccessDialog } from "./access-dialog";
import { startMcpBridge } from "./bridge";
import { useMcpHost } from "./host-store";
import type { McpConnectionInfo } from "./snippets";

export interface McpShell {
  /** Tool calls from the shell's MCP server (`BridgeRequest`s) come in; answers go out. */
  transport: Transport;
  connector: Connector;
  /** Where the server listens, for the copy-config snippets. */
  connection?: McpConnectionInfo;
}

/** One per app: what MCP clients may do, and their calls. */
export const mcpAccess = createMcpAccess();

let activeDocumentId: () => string | null = () => null;

/** Turns the MCP bridge on. Call it once: each call adds another listener to the transport. */
export function attachMcpShell({ transport, connector, connection }: McpShell): void {
  startMcpBridge({
    transport,
    contracts: managers,
    backend: connector,
    activeDocumentId: () => activeDocumentId(),
    access: mcpAccess,
  });
  useMcpHost.setState({ attached: true, connection: connection ?? null });
}

/** Lets the bridge resolve `"active"` to the tab on screen, and shows the access dialog when it's opened. */
export function McpHost() {
  const { workspace } = useModels();
  useEffect(() => {
    activeDocumentId = () => workspace.store.getState().activeId;
    return () => {
      activeDocumentId = () => null;
    };
  }, [workspace]);
  return <McpAccessDialog access={mcpAccess} />;
}
