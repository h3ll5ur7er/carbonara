// A flow between two ports, drawn from its own result slot: width from the rate, colour from how full its
// belt is, and particles that travel at a speed and spacing that encode the rate.
import { BaseEdge, useStore, type EdgeProps, type ReactFlowState } from "@xyflow/react";
import { memo, useCallback, type CSSProperties } from "react";
import { flowPath, isBackward, type PathEnds } from "../model/edge-path";
import { flowParticles, flowSaturation, flowWidth } from "../model/flow-style";
import { useEdgeSlot } from "./context";
import type { FlowEdge as FlowEdgeType } from "./types";

/** How far past the farther node a backward flow loops. */
const LOOP_CLEARANCE = 36;

export const FlowEdge = memo(function FlowEdge(props: EdgeProps<FlowEdgeType>) {
  const ends = endsOf(props);
  if (isBackward(ends)) return <BackwardFlow {...props} />;
  return <FlowPath id={props.id} path={flowPath(ends)} selected={props.selected ?? false} />;
});

/** Where the flow starts and ends, and which way its ports face (React Flow's positions are the same words). */
function endsOf(props: EdgeProps<FlowEdgeType>): PathEnds {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;
  return { sourceX, sourceY, targetX, targetY, sourceSide: sourcePosition, targetSide: targetPosition };
}

/**
 * A recycling loop: it routes past both of its nodes (below them, or to their right when flows run down), so it
 * needs their extent.
 */
function BackwardFlow(props: EdgeProps<FlowEdgeType>) {
  const { source, target } = props;
  const down = props.sourcePosition === "bottom";
  const loopAt = useStore(
    useCallback(
      (state: ReactFlowState) => Math.max(farSide(state, source, down), farSide(state, target, down)) + LOOP_CLEARANCE,
      [source, target, down],
    ),
  );
  return <FlowPath id={props.id} path={flowPath({ ...endsOf(props), loopAt })} selected={props.selected ?? false} />;
}

/** A node's bottom edge, or its right edge when flows run down. */
function farSide(state: ReactFlowState, id: string, down: boolean): number {
  const node = state.nodeLookup.get(id);
  if (!node) return 0;
  const { x, y } = node.internals.positionAbsolute;
  return down ? x + (node.measured.width ?? node.width ?? 0) : y + (node.measured.height ?? node.height ?? 0);
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
