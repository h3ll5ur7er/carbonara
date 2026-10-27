// A flow between two ports.
import { BaseEdge, useStore, type EdgeProps, type ReactFlowState } from "@xyflow/react";
import { memo, useCallback } from "react";
import { flowPath, isBackward } from "../model/edge-path";
import type { FlowEdge as FlowEdgeType } from "./types";

/** How far below the lower node a backward flow loops. */
const LOOP_CLEARANCE = 36;

export const FlowEdge = memo(function FlowEdge(props: EdgeProps<FlowEdgeType>) {
  if (isBackward(props.sourceX, props.targetX)) return <BackwardFlow {...props} />;
  return <FlowPath id={props.id} path={flowPath(props)} />;
});

/** A recycling loop: it routes below both of its nodes, so it needs their extent. */
function BackwardFlow(props: EdgeProps<FlowEdgeType>) {
  const { source, target } = props;
  const below = useStore(
    useCallback(
      (state: ReactFlowState) => Math.max(bottomOf(state, source), bottomOf(state, target)) + LOOP_CLEARANCE,
      [source, target],
    ),
  );
  return <FlowPath id={props.id} path={flowPath({ ...props, below })} />;
}

function bottomOf(state: ReactFlowState, id: string): number {
  const node = state.nodeLookup.get(id);
  if (!node) return 0;
  return node.internals.positionAbsolute.y + (node.measured.height ?? node.height ?? 0);
}

function FlowPath({ id, path }: { id: string; path: string }) {
  return <BaseEdge id={id} path={path} style={{ stroke: "var(--color-flow-healthy)", strokeWidth: 2 }} />;
}
