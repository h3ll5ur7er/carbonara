// Where the desktop shell plugs the MCP server into the client. The shell calls `attachMcpShell` once, before it
// renders the app; `McpHost`, rendered by the live app, tells the bridge which document is on screen.
// Without a shell (the web app) nothing starts.
import { useEffect } from "react";
import { managers } from "../../../contracts/managers";
import type { Transport } from "../../../utilities/rpc";
import type { Connector } from "../../core/connector";
import { useModels } from "../../core/models";
import { startMcpBridge } from "./bridge";

export interface McpShell {
  /** Tool calls from the shell's MCP server (`BridgeRequest`s) come in; answers go out. */
  transport: Transport;
  connector: Connector;
}

let activeDocumentId: () => string | null = () => null;

/** Turns the MCP bridge on. Call it once: each call adds another listener to the transport. */
export function attachMcpShell({ transport, connector }: McpShell): void {
  startMcpBridge({ transport, contracts: managers, backend: connector, activeDocumentId: () => activeDocumentId() });
}

/** Lets the bridge resolve `"active"` to the tab on screen. */
export function McpHost() {
  const { workspace } = useModels();
  useEffect(() => {
    activeDocumentId = () => workspace.store.getState().activeId;
    return () => {
      activeDocumentId = () => null;
    };
  }, [workspace]);
  return null;
}
