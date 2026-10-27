// The ghost on a React Flow canvas: its views become non-interactive nodes and edges drawn by the canvas's
// own components (translucent through the `ghost` class), behind which a dashed frame marks the whole
// preview and serves as its handle. A fixed ghost drags as one and snaps its offset to the grid; a pointer
// ghost follows the pointer anywhere over the canvas, snapping like a dragged node with the same guides, until
// a click or Enter places it (Escape cancels, arrow keys move it). New fixed ghosts are brought into view.
import { useReactFlow, useStore, useStoreApi, type NodeChange, type NodeProps } from "@xyflow/react";
import { Move } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { isEditableTarget } from "../../core/commands-shortcuts";
import type { Point } from "../adapter";
import { GRID } from "../model/geometry";
import type { EdgeView, NodeView } from "../model/scene";
import type { Gap, Guide } from "../model/snap";
import type { FlowEdge, FlowNode } from "../react-flow/types";
import { viewportCentre } from "../viewport";
import { followPointer, ghostId, isGhost, neighbours, type GhostView, type Rect } from "./ghost";

/** Room between the frame and the ghost's nodes. */
const FRAME_PADDING = GRID;
const FRAME_ID = ghostId("frame");
const ORIGIN = { x: 0, y: 0 };
/** How close, in screen pixels, a following ghost has to come to snap to a neighbour (as a dragged node). */
const SNAP_PIXELS = 6;
/** Arrow keys move a following ghost a grid step; with Shift, this many. */
const BIG_STEP = 4;

export interface GhostLayerOptions {
  ghost: GhostView | undefined;
  /** The ghost was placed: dragged and dropped (fixed), or clicked down (pointer). */
  onPlace(offset: Point): void;
  /** Escape while a pointer ghost follows the pointer. */
  onCancel(): void;
  /** Brings the ghost's nodes into view, with those of the graph around it if they fit well. */
  reveal(ghost: { id: string }[], context: { id: string }[]): void;
}

interface Marks {
  guides: Guide[];
  gaps: Gap[];
}
const NO_MARKS: Marks = { guides: [], gaps: [] };

export function useGhostLayer({ ghost, onPlace, onCancel, reveal }: GhostLayerOptions) {
  const { screenToFlowPosition } = useReactFlow<FlowNode, FlowEdge>();
  const store = useStoreApi<FlowNode, FlowEdge>();
  const placement = ghost?.placement;
  const initial = placement?.mode === "fixed" ? placement.offset : null;
  // Where the ghost is while it's dragged or follows the pointer; reset when a new ghost or placement arrives.
  const [moved, setMoved] = useState<{ from: GhostView["placement"] | undefined; offset: Point } | null>(null);
  const [marks, setMarks] = useState<{ from: GhostView["placement"] | undefined; marks: Marks } | null>(null);
  const offset = useMemo(
    () => (moved?.from === placement ? moved?.offset : undefined) ?? initial ?? ORIGIN,
    [moved, placement, initial],
  );
  const following = placement?.mode === "pointer";
  /** Where the pointer was last over the canvas, in screen pixels. */
  const pointer = useRef<Point | null>(null);

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

  /** Centres a following ghost on a flow point, snapped like a dragged node; `free` (Alt) skips the snapping. */
  const follow = useCallback(
    (at: Point, free: boolean) => {
      if (!ghost || ghost.placement.mode !== "pointer") return;
      const from = ghost.placement;
      const { transform, width, height } = store.getState();
      const [panX, panY, zoom] = transform;
      const visible: Rect = { x: -panX / zoom, y: -panY / zoom, width: width / zoom, height: height / zoom };
      const others = free
        ? []
        : store
            .getState()
            .nodes.filter((node) => !isGhost(node.id) && node.type !== "frame" && !node.hidden)
            .map(rectOf)
            .filter((rect) => intersects(rect, visible));
      const followed = followPointer(ghost.bounds, at, others, {
        grid: free ? 1 : GRID,
        threshold: SNAP_PIXELS / zoom,
      });
      setMoved((current) =>
        current?.from === from && samePoint(current.offset, followed.offset)
          ? current
          : { from, offset: followed.offset },
      );
      // Most moves snap to the grid alone: no new marks, no render for them.
      setMarks((current) =>
        !hasMarks(followed) && !(current && hasMarks(current.marks))
          ? current
          : { from, marks: { guides: followed.guides, gaps: followed.gaps } },
      );
    },
    [ghost, store],
  );

  // A new pointer ghost starts where it asks, else under the pointer if that was on the canvas, else mid-view.
  useLayoutEffect(() => {
    if (!ghost || ghost.placement.mode !== "pointer") return;
    const start = ghost.placement.at ??
      (pointer.current && screenToFlowPosition(pointer.current)) ??
      viewportCentre() ?? { x: ghost.bounds.x + ghost.bounds.width / 2, y: ghost.bounds.y + ghost.bounds.height / 2 };
    follow(start, false);
    // Once per placement: later moves come from the pointer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement]);

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

  /** For the canvas's root: remembers where the pointer is, and moves a following ghost there. */
  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      if (following) follow(screenToFlowPosition(pointer.current), event.altKey);
    },
    [following, follow, screenToFlowPosition],
  );
  /** For the canvas's root, capturing: a click anywhere places a following ghost, and does nothing else. */
  const onClickCapture = useCallback(
    (event: MouseEvent) => {
      if (!following || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      onPlace(offset);
    },
    [following, offset, onPlace],
  );

  // While it follows, the ghost has the keys before anything else on the page (outside text fields).
  useEffect(() => {
    if (!following || !placement) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target instanceof HTMLElement ? event.target : null)) {
        return;
      }
      const step = event.shiftKey ? GRID * BIG_STEP : GRID;
      const arrows: Record<string, Point> = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
      };
      const arrow = arrows[event.key];
      if (event.key === "Escape") onCancel();
      else if (event.key === "Enter") onPlace(offset);
      else if (arrow) setMoved({ from: placement, offset: { x: offset.x + arrow.x, y: offset.y + arrow.y } });
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [following, placement, offset, onPlace, onCancel]);

  const shownMarks = (following && marks?.from === placement && marks?.marks) || NO_MARKS;
  return { nodes, edges, takeChanges, onPointerMove, onClickCapture, following, marks: shownMarks };
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

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function hasMarks(marks: Marks): boolean {
  return marks.guides.length + marks.gaps.length > 0;
}

function rectOf(node: FlowNode): Rect {
  return { x: node.position.x, y: node.position.y, width: node.width ?? 0, height: node.height ?? 0 };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
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
        {following ? (
          <>
            {label} · click to place
            <span className="font-normal opacity-80">· Esc to cancel</span>
          </>
        ) : (
          <>{label} · drag to move</>
        )}
      </span>
    </div>
  );
}
