// Desktop shell, UI thread: the web app in the Tauri window, with the desktop platform wired in. The backend
// worker stores in the app data folder through the Tauri commands this thread serves it; the File commands use
// native dialogs; files opened with the app open here; the MCP server's tool calls reach the managers through
// this thread; macOS gets a menu bar. See docs/Architecture/Desktop.md.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../client/app";
import { ConnectorProvider, createConnector } from "../../client/core/connector";
import { platformOf } from "../../client/core/commands-shortcuts";
import { setFileAccess } from "../../client/features/documents/actions";
import { attachMcpShell } from "../../client/features/mcp/host";
import type { McpConnectionInfo } from "../../client/features/mcp/snippets";
import { appRegistry } from "../../client/shell/app-commands";
import { errorMessage, toast } from "../../client/shell/toasts";
import "../../client/styles.css";
import { createTauriFileAccess, type FileContents } from "../../platforms/tauri/files";
import { serveInvoke } from "../../platforms/tauri/invoke";
import { STORAGE_COMMANDS } from "../../platforms/tauri/key-value";
import { mcpTransport } from "./mcp";
import { installMenuBar } from "./menu";
import { OpenedFiles } from "./opened-files";

const worker = new Worker(new URL("./backend.worker.ts", import.meta.url), { type: "module" });
// The worker's first message: its own line to the storage commands, and to nothing else.
const { port1, port2 } = new MessageChannel();
serveInvoke(port1, invoke, STORAGE_COMMANDS);
worker.postMessage({ invokePort: port2 }, [port2]);
const connector = createConnector({
  send: (message) => worker.postMessage(message),
  listen: (listener) => worker.addEventListener("message", (event) => listener(event.data)),
});

setFileAccess(createTauriFileAccess(invoke));
// Before rendering, so the AI access dialog has the connection for its copy-config snippets.
const mcpConnection = await invoke<McpConnectionInfo | null>("mcp_connection");
attachMcpShell({
  connector,
  transport: mcpTransport(invoke, listen),
  ...(mcpConnection && { connection: mcpConnection }),
});
if (platformOf(navigator.platform) === "mac") {
  installMenuBar(appRegistry).catch((error: unknown) =>
    toast({ title: "Couldn't set up the menu bar", description: errorMessage(error), tone: "error" }),
  );
}

const takeOpenedFiles = () => invoke<FileContents[]>("take_opened_files");
/** The shell emits `files-opened` when files arrive while the app runs (src-tauri/src/lib.rs). */
function onFilesOpened(listener: () => void): () => void {
  const stop = listen("files-opened", listener);
  return () => void stop.then((unlisten) => unlisten());
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <ConnectorProvider connector={connector}>
      <App />
      <OpenedFiles take={takeOpenedFiles} onOpened={onFilesOpened} />
    </ConnectorProvider>
  </StrictMode>,
);
