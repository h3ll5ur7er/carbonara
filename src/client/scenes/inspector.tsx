// Scene `inspector`: both side panels open, the inspector showing a node with one field of each kind.
// Edits go through a fake editing manager, which refuses to turn on the somersloop (to show an error toast).
import { useMemo, useState } from "react";
import type { FieldDescriptor, FieldValue } from "../../contracts/plugin";
import { fail, ok } from "../../contracts/result";
import { AppShell } from "../shell/app-shell";
import { ConnectorProvider } from "../core/connector";
import { panelWidths } from "../shell/panel-layout";
import { usePanels } from "../shell/panels";
import { fakeConnector } from "./fake-backend";

/** Fields as a Satisfactory-like plugin declares them for a smelter. */
const fields: Record<string, FieldDescriptor> = {
  clock: { kind: "number", label: "Clock speed", min: 1, max: 250, step: 0.0001, unit: "%", default: 100 },
  shards: { kind: "number", label: "Power shards", min: 0, max: 3, step: 1, default: 0 },
  mode: { kind: "choice", label: "Mode", options: ["Balanced", "Max output", "Min power"], default: "Balanced" },
  sloop: { kind: "toggle", label: "Somersloop", default: false },
};

const document = { id: "scene", name: "Untitled factory", packId: "template", version: 1 };

export default function InspectorScene() {
  const [values, setValues] = useState<Record<string, FieldValue>>({ clock: 137.5, shards: 2 });
  const connector = useMemo(
    () =>
      fakeConnector({
        editing: {
          apply: async ({ commands }) => {
            const fields = commands.flatMap((command) => (command.type === "setNodeFields" ? [command.fields] : []));
            if (fields.some((edit) => edit.sloop === true)) {
              return fail([{ path: ["sloop"], message: "No somersloops left in this save." }]);
            }
            setValues((current) => Object.assign({}, current, ...fields));
            return ok({ ...document, version: document.version + 1 });
          },
        },
      }),
    [],
  );
  return (
    <ConnectorProvider connector={connector}>
      <AppShell
        selection={{
          target: { documentId: document.id, nodeId: "smelter" },
          node: { title: "Iron Plate", subtitle: "Furnace · 4 × 100% + 1 × 37.5%", fields, values },
        }}
      />
    </ConnectorProvider>
  );
}

usePanels.setState({
  left: { open: true, width: panelWidths.left.default },
  right: { open: true, width: panelWidths.right.default },
});
