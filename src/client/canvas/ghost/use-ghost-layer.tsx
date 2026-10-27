// The ghost on a React Flow canvas: its views become non-interactive nodes and edges drawn by the canvas's
// own components (translucent through the `ghost` class), behind which a dashed frame marks the whole
// preview and serves as its handle. A fixed ghost drags as one and snaps its offset to the grid; a pointer
// ghost follows the pointer until a click places it. New ghosts are brought into view.
import { useReactFlow, useStore, useStoreApi, type NodeChange, type NodeProps } from "@xyflow/react";
import { Move } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import type { Point } from "../adapter";
import { GRID } from "../model/geometry";
import type { EdgeView, NodeView } from "../model/scene";
import type { FlowEdge, FlowNode } from "../react-flow/types";
import { ghostId, isGhost, neighbours, type GhostView, type Rect } from "./ghost";

/** Room between the frame and the ghost's nodes. */
const FRAME_PADDING = GRID;
const FRAME_ID = ghostId("frame");
const ORIGIN = { x: 0, y: 0 };

export interface GhostLayerOptions {
  ghost: GhostView | undefined;
  /** The ghost was placed: dragged and dropped (fixed), or clicked down (pointer). */
  onPlace(offset: Point): void;
  /** Escape while a pointer ghost follows the pointer. */
  onCancel(): void;
  /** Brings the ghost's nodes into view, with those of the graph around it if they fit well. */
  reveal(ghost: { id: string }[], context: { id: string }[]): void;
}

export function useGhostLayer({ ghost, onPlace, onCancel, reveal }: GhostLayerOptions) {
  const { screenToFlowPosition } = useReactFlow<FlowNode, FlowEdge>();
  const placement = ghost?.placement;
  const initial = placement?.mode === "fixed" ? placement.offset : null;
  // Where the ghost is while it's dragged or follows the pointer; reset when a new ghost or placement arrives.
  const [moved, setMoved] = useState<{ from: GhostView["placement"] | undefined; offset: Point } | null>(null);
  const offset = useMemo(
    () => (moved?.from === placement ? moved?.offset : undefined) ?? initial ?? ORIGIN,
    [moved, placement, initial],
  );
  const following = placement?.mode === "pointer";

  const nodes = useMemo(() => {
    if (!ghost) return [];
    const frame = framed(ghost.bounds);
    return [
      {
        id: FRAME_ID,
        type: "ghostFrame",
        position: { x: frame.x + offset.x, y: frame.y + offset.y },
        width: frame.width,
        height: frame.height,
        measured: { width: frame.width, height: frame.height },
        data: { following, label: ghost.label },
        className: "ghost-frame",
        selectable: false,
        focusable: false,
        connectable: false,
        draggable: !following,
        zIndex: -1,
      } as unknown as FlowNode,
      ...ghost.scene.nodes.map((view) => ghostNode(view, offset, following)),
    ];
  }, [ghost, offset, following]);

  const edges = useMemo(() => (ghost ? ghost.scene.edges.map(ghostEdge) : []), [ghost]);

  // A new ghost (not a move of the same one) comes into view with what it sits beside, unless it follows
  // the pointer anyway.
  const store = useStoreApi<FlowNode, FlowEdge>();
  const scene = ghost?.scene;
  useEffect(() => {
    if (!ghost || !scene || ghost.placement.mode !== "fixed") return;
    const placed = { ...ghost.bounds, x: ghost.bounds.x + offset.x, y: ghost.bounds.y + offset.y };
    const graph = store.getState().nodes.map((node) => ({
      id: node.id,
      ...node.position,
      width: node.width ?? 0,
      height: node.height ?? 0,
    }));
    reveal(
      scene.nodes.map((node) => ({ id: node.id })),
      neighbours(placed, graph).map((id) => ({ id })),
    );
    // Only new content is revealed; the ghost and its offset are read as they are then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, reveal]);

  /** Takes the ghost's own changes out of React Flow's; a drag of any of its nodes moves the whole ghost. */
  const takeChanges = useCallback(
    (changes: NodeChange<FlowNode>[]): NodeChange<FlowNode>[] => {
      if (!ghost) return changes;
      const own = changes.filter((change) => "id" in change && isGhost(change.id));
      const lead = own.find((change) => change.type === "position" && change.position);
      if (lead?.type === "position" && lead.position) {
        const base = basePosition(ghost, lead.id);
        const next = snapPoint({ x: lead.position.x - base.x, y: lead.position.y - base.y });
        setMoved({ from: ghost.placement, offset: next });
        if (!lead.dragging) onPlace(next);
      }
      return own.length === 0 ? changes : changes.filter((change) => !own.includes(change));
    },
    [ghost, onPlace],
  );

  const onPaneMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!ghost || !following) return;
      const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const centre = { x: ghost.bounds.x + ghost.bounds.width / 2, y: ghost.bounds.y + ghost.bounds.height / 2 };
      setMoved({ from: ghost.placement, offset: snapPoint({ x: pointer.x - centre.x, y: pointer.y - centre.y }) });
    },
    [ghost, following, screenToFlowPosition],
  );
  const onPaneClick = useCallback(() => {
    if (ghost && following) onPlace(offset);
  }, [ghost, following, offset, onPlace]);
  const onKeyDown = useCallback(
    (event: { key: string; preventDefault(): void }) => {
      if (!following || event.key !== "Escape") return false;
      event.preventDefault();
      onCancel();
      return true;
    },
    [following, onCancel],
  );

  return { nodes, edges, takeChanges, onPaneMouseMove, onPaneClick, onKeyDown, following };
}

function ghostNode(view: NodeView, offset: Point, following: boolean): FlowNode {
  return {
    id: view.id,
    type: view.kind,
    position: { x: view.position.x + offset.x, y: view.position.y + offset.y },
    width: view.width,
    height: view.height,
    measured: { width: view.width, height: view.height },
    data: { view },
    className: "ghost",
    selectable: false,
    focusable: false,
    connectable: false,
    deletable: false,
    draggable: !following,
  };
}

function ghostEdge(view: EdgeView): FlowEdge {
  return {
    id: view.id,
    type: "flow",
    source: view.source,
    target: view.target,
    sourceHandle: view.sourceHandle,
    targetHandle: view.targetHandle,
    data: { view },
    className: "ghost",
    selectable: false,
    focusable: false,
    deletable: false,
  };
}

function framed(bounds: Rect): Rect {
  return {
    x: bounds.x - FRAME_PADDING,
    y: bounds.y - FRAME_PADDING,
    width: bounds.width + 2 * FRAME_PADDING,
    height: bounds.height + 2 * FRAME_PADDING,
  };
}

/** Where a ghost node (or the frame) sits before the offset. */
function basePosition(ghost: GhostView, id: string): Point {
  if (id === FRAME_ID) return framed(ghost.bounds);
  return ghost.scene.nodes.find((node) => node.id === id)?.position ?? { x: 0, y: 0 };
}

function snapPoint(point: Point): Point {
  return { x: Math.round(point.x / GRID) * GRID, y: Math.round(point.y / GRID) * GRID };
}

/** The frame behind a ghost: a dashed, accent-tinted area with a label, and the handle to drag it by. */
export function GhostFrameNode({ data }: NodeProps<FlowNode>) {
  const { following, label } = data as unknown as { following: boolean; label: string };
  // The label keeps its size on screen at any zoom, sitting on the frame's top-left corner.
  const zoom = useStore((state) => state.transform[2]);
  return (
    <div className="ghost-frame-area relative size-full rounded-xl">
      <span
        style={{ transform: `scale(${1 / zoom}) translateY(calc(-100% - 6px))` }}
        className="absolute top-0 left-0 flex origin-top-left items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-on-accent shadow-sm"
      >
        <Move className="size-3.5" aria-hidden />
        {label} · {following ? "click to place" : "drag to move"}
      </span>
    </div>
  );
}
