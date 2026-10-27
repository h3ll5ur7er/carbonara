// Layout engine: how graphs are laid out. Hides ELK (layered layout, run by whatever ELK instance it is given)
// and our rules around it: which nodes take part, how frames keep their nodes together, where the arranged
// block goes, and what stays put. Pure: the ELK runner is passed in, so it can live in a worker of its own in
// the app and in-process in tests.
import type { ElkExtendedEdge, ElkNode, ElkPort, LayoutOptions } from "elkjs/lib/elk-api";
import type { Graph, LocalId, Position } from "../../contracts/document";
import type { ArrangeDirection, NodeShape } from "../../contracts/layout";

/** Runs an ELK layout; `elkjs`'s ELK class fits. */
export interface ElkRunner {
  layout(graph: ElkNode): Promise<ElkNode>;
}

export interface ArrangeInput {
  graph: Graph;
  positions: Record<LocalId, Position>;
  shapes: Record<LocalId, NodeShape>;
  direction: ArrangeDirection;
  /** The nodes to arrange; every node when left out. */
  nodeIds?: LocalId[] | undefined;
}

/** Where a node goes; frames also get their new size. */
export interface Placement {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/** The grid pitch of the canvas: the arranged block starts on it. */
export const GRID = 24;
/** Room between the columns (or rows) of a flow, and between nodes within one, in flow units. */
const LAYER_SPACING = GRID * 5;
const NODE_SPACING = GRID * 2;
const COMPONENT_SPACING = GRID * 4;
/** Inside a frame: room for its label at the top, a margin elsewhere. */
const FRAME_PADDING = `[top=${GRID * 2},left=${GRID},bottom=${GRID},right=${GRID}]`;
const SPACING: LayoutOptions = {
  "elk.layered.spacing.nodeNodeBetweenLayers": String(LAYER_SPACING),
  "elk.spacing.nodeNode": String(NODE_SPACING),
  "elk.spacing.componentComponent": String(COMPONENT_SPACING),
  "elk.spacing.edgeNode": String(GRID),
};
/** Nodes without a shape. */
const DEFAULT_SHAPE: NodeShape = { width: GRID * 4, height: GRID * 4, ports: [] };

/**
 * New positions for the arranged nodes. Locked nodes and notes outside frames never move. A frame moves and
 * fits around the nodes whose centre it holds when all of them take part; otherwise it stays, and they are
 * arranged like any other node. The arranged block keeps the top-left corner of where its nodes were, on the
 * grid, and is pushed clear of the nodes that stay.
 */
export async function arrange(input: ArrangeInput, elk: ElkRunner): Promise<Record<LocalId, Placement>> {
  const { graph, positions, direction } = input;
  const shapeOf = (id: LocalId) => input.shapes[id] ?? DEFAULT_SHAPE;
  const kindOf = (id: LocalId) => graph.nodes[id]?.kind;
  const requested = new Set(input.nodeIds ?? Object.keys(graph.nodes));
  const movable = (id: LocalId) => requested.has(id) && !positions[id]?.locked;
  // Today's order (top to bottom, left to right): ELK keeps to it where it can, so arranging twice is calm.
  const ids = Object.keys(graph.nodes).sort((a, b) => compareReadingOrder(positions[a], positions[b], direction));

  const parents = framesHolding(input, ids, shapeOf);
  const childrenOf = new Map<LocalId | null, LocalId[]>();
  for (const id of ids)
    childrenOf.set(parents.get(id) ?? null, [...(childrenOf.get(parents.get(id) ?? null) ?? []), id]);
  /** A frame takes part when it and everything it holds can move. */
  const framed = (frame: LocalId): boolean =>
    movable(frame) &&
    (childrenOf.get(frame) ?? []).length > 0 &&
    (childrenOf.get(frame) ?? []).every((id) => (kindOf(id) === "frame" ? framed(id) : movable(id)));
  /** A node outside a taking-part frame takes part when it has flows to arrange: notes stay where they are. */
  const takesPart = (id: LocalId): boolean => {
    const parent = parents.get(id);
    if (parent !== undefined && framed(parent)) return true;
    if (kindOf(id) === "frame") return framed(id);
    return movable(id) && kindOf(id) !== "note";
  };
  /** Where a node sits in ELK's tree: inside its frame when that frame takes part, else at the top. */
  const containerOf = (id: LocalId): LocalId | null => {
    const parent = parents.get(id);
    return parent !== undefined && framed(parent) ? parent : null;
  };

  const fed = new Set(Object.values(graph.edges).map((edge) => edge.to));
  const elkNode = (id: LocalId): ElkNode => {
    if (kindOf(id) === "frame") {
      return {
        id,
        // ELK reads spacing from each parent, so a frame needs it too.
        layoutOptions: { ...SPACING, "elk.padding": FRAME_PADDING },
        children: ids.filter((child) => containerOf(child) === id).map(elkNode),
      };
    }
    const shape = shapeOf(id);
    return {
      id,
      width: shape.width,
      height: shape.height,
      ports: shape.ports.map((port, index) => elkPort(id, index, port.side, port.x, port.y)),
      layoutOptions: {
        "elk.portConstraints": "FIXED_POS",
        // Raw materials start the flow, even those that feed a loop deep inside it (ELK refuses it for a node
        // with flows coming in, which a source shouldn't have but may).
        ...(kindOf(id) === "source" && !fed.has(id) && { "elk.layered.layering.layerConstraint": "FIRST" }),
      },
    };
  };
  const top = ids.filter((id) => takesPart(id) && containerOf(id) === null);
  if (top.length === 0) return {};
  const inside = new Set(ids.filter(takesPart));
  const edges: ElkExtendedEdge[] = Object.entries(graph.edges)
    .filter(([, edge]) => inside.has(edge.from) && inside.has(edge.to) && edge.from !== edge.to)
    .map(([id, edge]) => ({
      id,
      sources: [portId(edge.from, shapeOf(edge.from), "out", edge.item)],
      targets: [portId(edge.to, shapeOf(edge.to), "in", edge.item)],
    }));

  const laid = await elk.layout({
    id: "\u0000root",
    layoutOptions: layoutOptions(direction),
    children: top.map(elkNode),
    edges,
  });

  // ELK places children relative to their parent.
  const placed = new Map<LocalId, Placement>();
  const collect = (nodes: ElkNode[] | undefined, origin: { x: number; y: number }) => {
    for (const node of nodes ?? []) {
      const at = { x: origin.x + (node.x ?? 0), y: origin.y + (node.y ?? 0) };
      const frame = kindOf(node.id) === "frame";
      placed.set(node.id, frame ? { ...at, width: node.width ?? 0, height: node.height ?? 0 } : at);
      collect(node.children, at);
    }
  };
  collect(laid.children, { x: 0, y: 0 });

  const sizeOf = (id: LocalId): { width: number; height: number } => {
    const placement = placed.get(id);
    const shape = shapeOf(id);
    return { width: placement?.width ?? shape.width, height: placement?.height ?? shape.height };
  };
  const before = boundsOf(
    top.map((id) => rectOf(positions[id], kindOf(id) === "frame" ? frameSize(positions[id]) : shapeOf(id))),
  );
  const after = boundsOf(top.map((id) => ({ ...sizeOf(id), ...(placed.get(id) ?? { x: 0, y: 0 }) })));
  let offset = { x: snap(before.x) - after.x, y: snap(before.y) - after.y };

  // The nodes that stay push the arranged block clear of them; frames that stay sit behind it and don't.
  const staying = ids
    .filter((id) => !inside.has(id) && kindOf(id) !== "frame" && positions[id])
    .map((id) => rectOf(positions[id], shapeOf(id)));
  const moved = (id: LocalId) => ({ ...sizeOf(id), ...add(placed.get(id) ?? { x: 0, y: 0 }, offset) });
  for (let attempt = 0; attempt < staying.length; attempt++) {
    const blocking = staying.filter((rect) => top.some((id) => overlaps(moved(id), rect)));
    if (blocking.length === 0) break;
    // Past the lowest (or rightmost) blocker, across the flow, so the flow's own direction stays free.
    const block = boundsOf(top.map(moved));
    if (direction === "right") {
      const clear = Math.max(...blocking.map((rect) => rect.y + rect.height)) + NODE_SPACING;
      offset = { ...offset, y: offset.y + snap(clear - block.y, Math.ceil) };
    } else {
      const clear = Math.max(...blocking.map((rect) => rect.x + rect.width)) + NODE_SPACING;
      offset = { ...offset, x: offset.x + snap(clear - block.x, Math.ceil) };
    }
  }

  return Object.fromEntries(
    [...placed].map(([id, placement]) => {
      const { x, y } = add(placement, offset);
      return [id, { ...placement, x: Math.round(x), y: Math.round(y) }];
    }),
  );
}

/** For each node, the smallest frame that holds its centre (frames hold smaller frames too). */
function framesHolding(
  input: ArrangeInput,
  ids: LocalId[],
  shapeOf: (id: LocalId) => NodeShape,
): Map<LocalId, LocalId> {
  const frames = ids
    .filter((id) => input.graph.nodes[id]?.kind === "frame" && input.positions[id])
    .map((id) => ({ id, rect: rectOf(input.positions[id], frameSize(input.positions[id])) }))
    .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height);
  const parents = new Map<LocalId, LocalId>();
  for (const id of ids) {
    const position = input.positions[id];
    if (!position) continue;
    const own = input.graph.nodes[id]?.kind === "frame" ? frameSize(position) : shapeOf(id);
    const centre = { x: position.x + own.width / 2, y: position.y + own.height / 2 };
    const area = own.width * own.height;
    const holder = frames.find(
      ({ id: frame, rect }) =>
        frame !== id &&
        rect.width * rect.height > area &&
        centre.x > rect.x &&
        centre.x < rect.x + rect.width &&
        centre.y > rect.y &&
        centre.y < rect.y + rect.height,
    );
    if (holder) parents.set(id, holder.id);
  }
  return parents;
}

/** Frames carry their size in the layout. */
function frameSize(position: Position | undefined): { width: number; height: number } {
  return { width: position?.width ?? GRID * 20, height: position?.height ?? GRID * 13 };
}

function layoutOptions(direction: ArrangeDirection): LayoutOptions {
  return {
    "elk.algorithm": "layered",
    "elk.direction": direction === "right" ? "RIGHT" : "DOWN",
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    ...SPACING,
    "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    // Straight runs between ports where it can, like a hand-made layout.
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  };
}

function elkPort(node: LocalId, index: number, side: "in" | "out", x: number, y: number): ElkPort {
  return {
    id: `${node}\u0000${index}`,
    x,
    y,
    width: 0,
    height: 0,
    layoutOptions: { "elk.port.side": side === "in" ? "WEST" : "EAST" },
  };
}

/** The port an edge leaves or enters by, or the node itself when it has none for the item. */
function portId(node: LocalId, shape: NodeShape, side: "in" | "out", item: string): string {
  const index = shape.ports.findIndex((port) => port.side === side && (port.item === undefined || port.item === item));
  return index < 0 ? node : `${node}\u0000${index}`;
}

function compareReadingOrder(a: Position | undefined, b: Position | undefined, direction: ArrangeDirection): number {
  const [first, second] = direction === "right" ? (["y", "x"] as const) : (["x", "y"] as const);
  return (a?.[first] ?? 0) - (b?.[first] ?? 0) || (a?.[second] ?? 0) - (b?.[second] ?? 0);
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectOf(position: Position | undefined, size: { width: number; height: number }): Rect {
  return { x: position?.x ?? 0, y: position?.y ?? 0, width: size.width, height: size.height };
}

function boundsOf(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x, y, width: right - x, height: bottom - y };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function add(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function snap(value: number, round: (value: number) => number = Math.round): number {
  return round(value / GRID) * GRID;
}
