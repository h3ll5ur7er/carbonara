// Snapping while dragging nodes: the dragged node settles on neighbours' edges and centres, on even spacing,
// or on the grid (model/snap.ts), and the others dragged along move by the same amount. Alt bypasses it.
// The guides and spacing marks that explain each snap are drawn over the graph.
import { useStore, useStoreApi, ViewportPortal, type NodeChange, type OnNodeDrag } from "@xyflow/react";
import { useCallback, useRef, useState } from "react";
import { GRID } from "../model/geometry";
import { formatNumber } from "../model/format";
import { snapDrag, type Gap, type Guide, type Rect } from "../model/snap";
import type { FlowEdge, FlowNode } from "./types";

/** How close, in screen pixels, a node has to come to snap to a neighbour. */
const SNAP_PIXELS = 6;

interface Marks {
  guides: Guide[];
  gaps: Gap[];
}

const NO_MARKS: Marks = { guides: [], gaps: [] };

export function useSnapping() {
  const store = useStoreApi<FlowNode, FlowEdge>();
  const dragged = useRef<string | null>(null);
  const bypass = useRef(false);
  /** The last snap's offset from the pointer's position; React Flow's own drop positions lack it. */
  const offset = useRef({ x: 0, y: 0 });
  const [marks, setMarks] = useState<Marks>(NO_MARKS);

  const onNodeDragStart: OnNodeDrag<FlowNode> = useCallback((event, node) => {
    dragged.current = node.id;
    bypass.current = event.altKey;
  }, []);
  const onNodeDrag: OnNodeDrag<FlowNode> = useCallback((event) => {
    bypass.current = event.altKey;
  }, []);
  /** Ends the drag; returns where the dragged nodes settled, given React Flow's unsnapped positions. */
  const onNodeDragEnd = useCallback((nodes: FlowNode[]) => {
    const { x, y } = offset.current;
    dragged.current = null;
    offset.current = { x: 0, y: 0 };
    setMarks(NO_MARKS);
    return Object.fromEntries(nodes.map((node) => [node.id, { x: node.position.x + x, y: node.position.y + y }]));
  }, []);

  /** Moves the drag's position changes so the node under the pointer snaps; the rest follow it. */
  const snapChanges = useCallback(
    (changes: NodeChange<FlowNode>[], nodes: FlowNode[]): NodeChange<FlowNode>[] => {
      const lead = changes.find((change) => change.type === "position" && change.id === dragged.current);
      if (lead?.type !== "position" || !lead.position) return changes;
      // The drop: React Flow repeats the pointer's position, which the last snap moved.
      if (!lead.dragging) return shift(changes, offset.current);
      if (bypass.current) {
        offset.current = { x: 0, y: 0 };
        setMarks(NO_MARKS);
        return changes;
      }
      const moving = new Set(changes.flatMap((change) => (change.type === "position" ? [change.id] : [])));
      const leadNode = nodes.find((node) => node.id === lead.id);
      if (!leadNode) return changes;
      const { transform, width, height } = store.getState();
      const [panX, panY, zoom] = transform;
      const visible: Rect = { x: -panX / zoom, y: -panY / zoom, width: width / zoom, height: height / zoom };
      const others = nodes
        .filter((node) => !moving.has(node.id) && node.type !== "frame")
        .map(rectOf)
        .filter((rect) => intersects(rect, visible));
      const snapped = snapDrag({ ...rectOf(leadNode), ...lead.position }, others, {
        grid: GRID,
        threshold: SNAP_PIXELS / zoom,
      });
      setMarks({ guides: snapped.guides, gaps: snapped.gaps });
      offset.current = { x: snapped.x - lead.position.x, y: snapped.y - lead.position.y };
      return shift(changes, offset.current);
    },
    [store],
  );

  return { marks, snapChanges, onNodeDragStart, onNodeDrag, onNodeDragEnd };
}

/** Moves every position change by the same offset, so the nodes dragged along keep their arrangement. */
function shift(changes: NodeChange<FlowNode>[], by: { x: number; y: number }): NodeChange<FlowNode>[] {
  return changes.map((change) =>
    change.type === "position" && change.position
      ? { ...change, position: { x: change.position.x + by.x, y: change.position.y + by.y } }
      : change,
  );
}

function rectOf(node: FlowNode): Rect {
  return { x: node.position.x, y: node.position.y, width: node.width ?? 0, height: node.height ?? 0 };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** How far guides run past the rects they join, in screen pixels. */
const GUIDE_OVERHANG = 12;
/** Half the length of the ticks that end a spacing mark, in screen pixels. */
const TICK = 4;

/** Alignment guides and spacing marks, drawn in flow coordinates but with constant on-screen sizes. */
export function SnapMarks({ guides, gaps }: Marks) {
  const zoom = useStore((state) => state.transform[2]);
  if (guides.length === 0 && gaps.length === 0) return null;
  const px = (pixels: number) => pixels / zoom;
  return (
    <ViewportPortal>
      <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width="1" height="1" aria-hidden>
        {guides.map((guide) => {
          const [x1, y1, x2, y2] =
            guide.axis === "x"
              ? [guide.at, guide.from - px(GUIDE_OVERHANG), guide.at, guide.to + px(GUIDE_OVERHANG)]
              : [guide.from - px(GUIDE_OVERHANG), guide.at, guide.to + px(GUIDE_OVERHANG), guide.at];
          return (
            <line
              key={`${guide.axis}${guide.at}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className="snap-guide stroke-accent"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {gaps.map((gap) => (
          <GapMark key={`${gap.axis}${gap.from}`} gap={gap} px={px} />
        ))}
      </svg>
    </ViewportPortal>
  );
}

function GapMark({ gap, px }: { gap: Gap; px: (pixels: number) => number }) {
  const horizontal = gap.axis === "x";
  const middle = (gap.from + gap.to) / 2;
  const point = (along: number, across: number) => (horizontal ? { x: along, y: across } : { x: across, y: along });
  const start = point(gap.from, gap.at);
  const end = point(gap.to, gap.at);
  const tick = (along: number) => {
    const a = point(along, gap.at - px(TICK));
    const b = point(along, gap.at + px(TICK));
    return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-accent" vectorEffect="non-scaling-stroke" />;
  };
  const label = point(middle, gap.at);
  return (
    <g className="snap-gap">
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        className="stroke-accent"
        vectorEffect="non-scaling-stroke"
      />
      {tick(gap.from)}
      {tick(gap.to)}
      <foreignObject x={label.x - px(24)} y={label.y - px(10)} width={px(48)} height={px(20)} overflow="visible">
        <div
          style={{ transform: `scale(${px(1)})`, transformOrigin: "0 0", width: 48, height: 20 }}
          className="grid place-items-center"
        >
          <span className="rounded-xs bg-accent px-1 font-mono text-2xs font-medium text-on-accent">
            {formatNumber(gap.to - gap.from)}
          </span>
        </div>
      </foreignObject>
    </g>
  );
}
