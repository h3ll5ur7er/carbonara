// Entry of the backend worker: everything below the client runs here, off the UI thread.
import { startBackend } from "./backend";

startBackend({
  send: (message) => self.postMessage(message),
  listen: (listener) => self.addEventListener("message", (event) => listener(event.data)),
});
