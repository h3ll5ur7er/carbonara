// Turns an inspector edit into a command for the editing manager, so every field change is one undo step.
import type { FieldDescriptor, FieldValue } from "../../../contracts/plugin";
import type { Connector } from "../../core/connector";
import { fieldEditLabel } from "./fields";

/** The node the inspector shows: in the document's root graph unless `graph` names a blueprint. */
export interface FieldEditTarget {
  documentId: string;
  graph?: string;
  nodeId: string;
  /** Several selected nodes edited at once, instead of `nodeId` alone. */
  nodeIds?: string[];
}

export interface FieldEdit {
  key: string;
  descriptor: FieldDescriptor;
  value: FieldValue;
}

export function applyFieldEdit(
  editing: Pick<Connector["editing"], "apply">,
  { documentId, graph = "root", nodeId, nodeIds = [nodeId] }: FieldEditTarget,
  { key, descriptor, value }: FieldEdit,
): ReturnType<Connector["editing"]["apply"]> {
  const label = fieldEditLabel(descriptor, value);
  return editing.apply({
    documentId,
    commands: nodeIds.map((id) => ({ type: "setNodeFields", graph, id, fields: { [key]: value } })),
    label: nodeIds.length > 1 ? `${label} on ${nodeIds.length} machines` : label,
  });
}
