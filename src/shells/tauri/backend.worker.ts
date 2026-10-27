// Entry of the desktop backend worker. The main thread's first message carries the port to the Tauri commands
// (main.tsx); every message after it is RPC.
import { proxyInvoke } from "../../platforms/tauri/invoke";
import { startDesktopBackend } from "./backend";

self.addEventListener(
  "message",
  (event: MessageEvent<{ invokePort: MessagePort }>) => {
    // Listeners added while this one runs don't receive this message, so the backend sees only RPC.
    startDesktopBackend(
      {
        send: (message) => self.postMessage(message),
        listen: (listener) => self.addEventListener("message", (message) => listener(message.data)),
      },
      proxyInvoke(event.data.invokePort),
    );
  },
  { once: true },
);
