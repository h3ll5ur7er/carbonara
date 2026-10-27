// Turns an inspector edit into a command for the editing manager, so every field change is one undo step.
import type { FieldDescriptor, FieldValue } from "../../../contracts/plugin";
import type { Connector } from "../../core/connector";
import { fieldEditLabel } from "./fields";

/** The node the inspector shows: in the document's root graph unless `graph` names a blueprint. */
export interface FieldEditTarget {
  documentId: string;
  graph?: string;
  nodeId: string;
}

export interface FieldEdit {
  key: string;
  descriptor: FieldDescriptor;
  value: FieldValue;
}

export function applyFieldEdit(
  editing: Pick<Connector["editing"], "apply">,
  { documentId, graph = "root", nodeId }: FieldEditTarget,
  { key, descriptor, value }: FieldEdit,
): ReturnType<Connector["editing"]["apply"]> {
  return editing.apply({
    documentId,
    commands: [{ type: "setNodeFields", graph, id: nodeId, fields: { [key]: value } }],
    label: fieldEditLabel(descriptor, value),
  });
}
