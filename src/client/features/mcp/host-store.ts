import { create } from "zustand";
import type { McpConnectionInfo } from "./snippets";

/** Whether a desktop shell attached the MCP bridge, where its server listens, and whether the dialog is open. */
export const useMcpHost = create<{ attached: boolean; connection: McpConnectionInfo | null; dialogOpen: boolean }>(
  () => ({ attached: false, connection: null, dialogOpen: false }),
);

export function setMcpDialogOpen(dialogOpen: boolean): void {
  useMcpHost.setState({ dialogOpen });
}
