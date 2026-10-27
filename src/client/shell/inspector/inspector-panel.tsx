// The inspector wired to the editing manager: each committed edit is sent through the connector, and an edit
// the manager refuses (or that fails on the way) shows an error toast.
import type { CommandInput } from "../../../contracts/commands";
import { useConnector } from "../../core/connector";
import { errorMessage, toast } from "../toasts";
import { applyFieldEdit, type FieldEdit, type FieldEditTarget } from "./edit";
import { Inspector, type InspectedNode } from "./inspector";

export interface InspectorPanelProps {
  /** The selected node and where it lives; null when nothing is selected. */
  selection: {
    target: FieldEditTarget;
    node: InspectedNode;
    /** The commands that set the node's production value (see `productionEdit`). */
    productionEdit?: (value: number | null) => { commands: CommandInput[]; label: string } | null;
  } | null;
}

export function InspectorPanel({ selection }: InspectorPanelProps) {
  const connector = useConnector();

  async function onFieldEdit(edit: FieldEdit) {
    if (!selection) return;
    try {
      const result = await applyFieldEdit(connector.editing, selection.target, edit);
      if (!result.ok) reportFailure(result.error.map((issue) => issue.message).join(" "));
    } catch (error) {
      reportFailure(errorMessage(error));
    }
  }

  async function onProductionEdit(value: number | null) {
    const edit = selection?.productionEdit?.(value);
    if (!selection || !edit) return;
    try {
      const result = await connector.editing.apply({ documentId: selection.target.documentId, ...edit });
      if (!result.ok) reportFailure(result.error.map((issue) => issue.message).join(" "));
    } catch (error) {
      reportFailure(errorMessage(error));
    }
  }

  return <Inspector node={selection?.node ?? null} onFieldEdit={onFieldEdit} onProductionEdit={onProductionEdit} />;
}

function reportFailure(description: string) {
  toast({ tone: "error", title: "Couldn't apply the edit", ...(description ? { description } : {}) });
}
