// Entry of the backend worker: everything below the client runs here, off the UI thread. Third-party pack plugins
// run one level further down, each in an opaque-origin plugin sandbox started from here.
import sandbox from "virtual:plugin-sandbox";
import { startOpaqueWorker } from "../../platforms/web/opaque-worker";
import { startBackend } from "./backend";
import { isolatePlugin } from "./plugin-sandbox";

startBackend(
  {
    send: (message) => self.postMessage(message),
    listen: (listener) => self.addEventListener("message", (event) => listener(event.data)),
  },
  { isolate: (plugin) => isolatePlugin({ start: () => startOpaqueWorker(sandbox, "plugin-sandbox") }, plugin) },
);
