// Entry of a plugin sandbox: an opaque-origin worker running one third-party pack's plugin next to the compiler
// engine. Bundled into one module by plugin-sandbox.vite.ts (`virtual:plugin-sandbox`) and started by the backend
// worker. Before any plugin code runs, the network and worker APIs are taken away; the opaque origin already keeps
// it from our storage.
import { createSandboxRuntime } from "./plugin-sandbox-runtime";

const TAKEN = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "WebTransport",
  "EventSource",
  "importScripts",
  "Worker",
  "SharedWorker",
  "BroadcastChannel",
];

/** Deletes a global everywhere along the prototype chain, so it can't be found again through a prototype. */
function take(name: string): void {
  for (let scope: object | null = globalThis; scope; scope = Object.getPrototypeOf(scope)) {
    if (Object.hasOwn(scope, name)) Reflect.deleteProperty(scope, name);
  }
}
TAKEN.forEach(take);

const answer = createSandboxRuntime(
  (source) => import(/* @vite-ignore */ `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`),
);
self.addEventListener("message", (event: MessageEvent) => {
  void answer(event.data).then((reply) => self.postMessage(reply));
});
