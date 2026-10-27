// Scene `empty`: the app as it first opens, with nothing on the canvas and nothing selected.
import { AppShell } from "../app";
import { ConnectorProvider } from "../core/connector";
import { fakeConnector } from "./fake-backend";

const connector = fakeConnector({});

export default function EmptyScene() {
  return (
    <ConnectorProvider connector={connector}>
      <AppShell />
    </ConnectorProvider>
  );
}
