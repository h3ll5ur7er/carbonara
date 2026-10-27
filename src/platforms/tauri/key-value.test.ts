import { afterEach } from "vitest";
import { testKeyValueStorage } from "../../contracts/platform.contract";
import { fakeStorageCommands } from "./fake-storage-commands";
import { proxyInvoke, serveInvoke } from "./invoke";
import { createTauriStorage, STORAGE_COMMANDS } from "./key-value";

const ports: MessagePort[] = [];
afterEach(() => ports.splice(0).forEach((port) => port.close()));

// Through the worker proxy, as in the app.
testKeyValueStorage("Tauri storage", () => {
  const { port1, port2 } = new MessageChannel();
  ports.push(port1, port2);
  serveInvoke(port1, fakeStorageCommands(), STORAGE_COMMANDS);
  const invoke = proxyInvoke(port2);
  return { open: () => createTauriStorage("carbonara-test", invoke) };
});
