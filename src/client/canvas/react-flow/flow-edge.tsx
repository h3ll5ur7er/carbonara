// A flow between two ports, drawn from its own result slot: width from the rate, colour from how full its
// belt is, and particles that travel at a speed and spacing that encode the rate.
import { BaseEdge, useStore, type EdgeProps, type ReactFlowState } from "@xyflow/react";
import { memo, useCallback, type CSSProperties } from "react";
import { flowPath, isBackward } from "../model/edge-path";
import { flowParticles, flowSaturation, flowWidth } from "../model/flow-style";
import { useEdgeSlot } from "./context";
import type { FlowEdge as FlowEdgeType } from "./types";

/** How far below the lower node a backward flow loops. */
const LOOP_CLEARANCE = 36;

export const FlowEdge = memo(function FlowEdge(props: EdgeProps<FlowEdgeType>) {
  if (isBackward(props.sourceX, props.targetX)) return <BackwardFlow {...props} />;
  return <FlowPath id={props.id} path={flowPath(props)} selected={props.selected ?? false} />;
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
  return <FlowPath id={props.id} path={flowPath({ ...props, below })} selected={props.selected ?? false} />;
}

function bottomOf(state: ReactFlowState, id: string): number {
  const node = state.nodeLookup.get(id);
  if (!node) return 0;
  return node.internals.positionAbsolute.y + (node.measured.height ?? node.height ?? 0);
}

function FlowPath({ id, path, selected }: { id: string; path: string; selected: boolean }) {
  const slot = useEdgeSlot(id);
  const saturation = flowSaturation(slot);
  const width = flowWidth(slot?.perSecond);
  const particles = flowParticles(slot?.perSecond);
  const style = { "--flow-width": width } as CSSProperties;
  return (
    <g className="flow" data-saturation={saturation} data-selected={selected || undefined} style={style}>
      {(saturation === "near-capacity" || saturation === "over-capacity") && (
        <path d={path} className="flow-halo" fill="none" />
      )}
      <BaseEdge id={id} path={path} className="flow-line" interactionWidth={Math.max(width + 12, 20)} />
      {particles && (
        <path
          d={path}
          className="flow-particles"
          fill="none"
          style={{ "--spacing": particles.spacing, "--cycle": `${particles.seconds}s` } as CSSProperties}
        />
      )}
    </g>
  );
}
