// Scene `palette`: a document of the template pack is open, so the command palette offers quick-add.
import { useMemo } from "react";
import { ok } from "../../contracts/result";
import { AppShell } from "../shell/app-shell";
import { ConnectorProvider } from "../core/connector";
import { fakeConnector } from "./fake-backend";
import { templatePack } from "./template-pack";

const document = { id: "scene", name: "Smelting line", packId: "template" };

const sceneEdits: unknown[] = [];
Object.assign(window, { sceneEdits });

export default function PaletteScene() {
  const connector = useMemo(
    () =>
      fakeConnector({
        packs: { getPackData: async () => templatePack },
        editing: {
          apply: async (args) => {
            // For e2e tests: the edits the manager received, after RPC validation.
            sceneEdits.push(args);
            return ok({ ...document, version: 2 });
          },
        },
      }),
    [],
  );
  return (
    <ConnectorProvider connector={connector}>
      <AppShell document={document} />
    </ConnectorProvider>
  );
}
