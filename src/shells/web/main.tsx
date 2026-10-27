// Web shell: starts the backend worker and boots the client in the browser.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../client/app";
import { ConnectorProvider, createConnector } from "../../client/core/connector";
import "../../client/styles.css";

const worker = new Worker(new URL("./backend.worker.ts", import.meta.url), { type: "module" });
const connector = createConnector({
  send: (message) => worker.postMessage(message),
  listen: (listener) => worker.addEventListener("message", (event) => listener(event.data)),
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <ConnectorProvider connector={connector}>
      <App />
    </ConnectorProvider>
  </StrictMode>,
);
