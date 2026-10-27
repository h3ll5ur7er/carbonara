// Composition root of the desktop backend: the web backend (src/shells/web/backend.ts), with storage in the app
// data folder instead of IndexedDB. Runs in the backend worker and reaches the Rust shell's commands through
// `invoke`, which the main thread serves (main.tsx). Plugins run like in a browser without the sandbox: from a
// Blob URL in the backend worker.
import type { Invoke } from "../../platforms/tauri/invoke";
import { createTauriStorage } from "../../platforms/tauri/key-value";
import type { Transport } from "../../utilities/rpc";
import { startBackend } from "../web/backend";

export function startDesktopBackend(transport: Transport, invoke: Invoke): void {
  startBackend(transport, { storage: (name) => createTauriStorage(name, invoke) });
}
