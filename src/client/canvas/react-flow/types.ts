// The React Flow node and edge types the canvas uses: each carries its renderer-neutral view.
import type { Edge, Node, NodeProps } from "@xyflow/react";
import type { EdgeView, NodeView, NodeViewKind } from "../model/scene";

export type FlowNode = Node<{ view: NodeView }, NodeViewKind>;
export type FlowEdge = Edge<{ view: EdgeView }, "flow">;

/** Props of the component that draws nodes of one kind. */
export interface FlowNodeProps<K extends NodeViewKind> extends Omit<NodeProps<FlowNode>, "data"> {
  data: { view: Extract<NodeView, { kind: K }> };
}
