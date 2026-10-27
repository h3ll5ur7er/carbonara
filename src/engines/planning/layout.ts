// Where a proposal's nodes go: a layered layout, left to right in the direction of flow. Raw inputs start
// the first column, the targets end the last, and every other node sits one column right of its furthest
// input. Within a column nodes line up with what feeds them. A stand-in for the layout engine's arrange
// (CARB-49), good enough to read a plan at a glance; auto-arrange tidies up further.
import type { LocalId } from "../../contracts/document";

/** The canvas's grid pitch (src/client/canvas/model/geometry.ts); positions land on it. */
export const GRID = 24;
/** Room between columns for the flows, and between nodes in a column. */
export const COLUMN_GAP = 4 * GRID;
export const ROW_GAP = 2 * GRID;

export interface LayoutNode {
  id: LocalId;
  role: "source" | "between" | "target";
  width: number;
  height: number;
}

export interface LayoutEdge {
  from: LocalId;
  to: LocalId;
}

type Point = { x: number; y: number };

/** Top-left corners; the layout's top-left corner is the origin. Deterministic in the order of `nodes`. */
export function layered(nodes: LayoutNode[], edges: LayoutEdge[]): Record<LocalId, Point> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const forward = forwardEdges(
    nodes,
    edges.filter((edge) => byId.has(edge.from) && byId.has(edge.to)),
  );
  const predecessors = new Map(nodes.map((node) => [node.id, [] as LocalId[]]));
  const successors = new Map(nodes.map((node) => [node.id, [] as LocalId[]]));
  for (const edge of forward) {
    predecessors.get(edge.to)?.push(edge.from);
    successors.get(edge.from)?.push(edge.to);
  }

  const rank = ranks(nodes, predecessors, successors);
  const last = Math.max(0, ...rank.values());
  for (const node of nodes) if (node.role === "target") rank.set(node.id, last);

  const columns: LayoutNode[][] = Array.from({ length: last + 1 }, () => []);
  for (const node of nodes) columns[rank.get(node.id) ?? 0]?.push(node);
  order(columns, predecessors, successors);

  const at = new Map<LocalId, Point>();
  let x = 0;
  for (const column of columns) {
    for (const node of column) at.set(node.id, { x, y: 0 });
    x += Math.max(0, ...column.map((node) => node.width)) + COLUMN_GAP;
  }

  const centre = (id: LocalId) => (at.get(id)?.y ?? 0) + (byId.get(id)?.height ?? 0) / 2;
  const average = (ids: LocalId[]) => ids.reduce((sum, id) => sum + centre(id), 0) / ids.length;
  // Left to right, each node as level as it can be with its inputs; then raw inputs level with their users.
  for (const column of columns) {
    stack(column, at, (node) => {
      const inputs = predecessors.get(node.id) ?? [];
      return inputs.length > 0 ? average(inputs) - node.height / 2 : undefined;
    });
  }
  const first = columns[0] ?? [];
  stack(first, at, (node) => {
    const users = successors.get(node.id) ?? [];
    return users.length > 0 ? average(users) - node.height / 2 : undefined;
  });

  const top = Math.min(...[...at.values()].map((point) => point.y));
  return Object.fromEntries([...at].map(([id, point]) => [id, { x: point.x, y: point.y - top }]));
}

/** The edges that run with the flow: a depth-first walk from the raw inputs drops the ones that close a cycle. */
function forwardEdges(nodes: LayoutNode[], edges: LayoutEdge[]): LayoutEdge[] {
  const out = new Map<LocalId, LayoutEdge[]>();
  for (const edge of edges) out.set(edge.from, [...(out.get(edge.from) ?? []), edge]);
  const state = new Map<LocalId, "open" | "done">();
  const back = new Set<LayoutEdge>();
  const visit = (id: LocalId) => {
    state.set(id, "open");
    for (const edge of out.get(id) ?? []) {
      const next = state.get(edge.to);
      if (next === "open") back.add(edge);
      else if (next === undefined) visit(edge.to);
    }
    state.set(id, "done");
  };
  const starts = [...nodes.filter((node) => node.role === "source"), ...nodes];
  for (const node of starts) if (!state.has(node.id)) visit(node.id);
  return edges.filter((edge) => !back.has(edge) && edge.from !== edge.to);
}

/** The longest path from a node without inputs (the graph of forward edges has no cycles). */
function ranks(
  nodes: LayoutNode[],
  predecessors: Map<LocalId, LocalId[]>,
  successors: Map<LocalId, LocalId[]>,
): Map<LocalId, number> {
  const waiting = new Map(nodes.map((node) => [node.id, predecessors.get(node.id)?.length ?? 0]));
  const rank = new Map(nodes.map((node) => [node.id, 0]));
  const ready = nodes.filter((node) => waiting.get(node.id) === 0).map((node) => node.id);
  while (ready.length > 0) {
    const id = ready.shift() as LocalId;
    for (const next of successors.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1));
      const left = (waiting.get(next) ?? 0) - 1;
      waiting.set(next, left);
      if (left === 0) ready.push(next);
    }
  }
  return rank;
}

/** Orders each column by where its inputs sit (then, backwards, its users), so flows cross less. */
function order(columns: LayoutNode[][], predecessors: Map<LocalId, LocalId[]>, successors: Map<LocalId, LocalId[]>) {
  const index = new Map<LocalId, number>();
  const remember = (column: LayoutNode[]) => column.forEach((node, position) => index.set(node.id, position));
  columns.forEach(remember);
  const sortBy = (column: LayoutNode[], neighbours: Map<LocalId, LocalId[]>) => {
    const key = new Map(
      column.map((node, position) => {
        const known = (neighbours.get(node.id) ?? []).filter((id) => index.has(id));
        const value =
          known.length > 0 ? known.reduce((sum, id) => sum + (index.get(id) ?? 0), 0) / known.length : position;
        return [node.id, value];
      }),
    );
    column.sort((a, b) => (key.get(a.id) ?? 0) - (key.get(b.id) ?? 0));
    remember(column);
  };
  for (const column of columns.slice(1)) sortBy(column, predecessors);
  for (const column of columns.slice(0, -1).reverse()) sortBy(column, successors);
}

/** Places a column top to bottom: each node at its wish where there's room, else just below the one above. */
function stack(column: LayoutNode[], at: Map<LocalId, Point>, wish: (node: LayoutNode) => number | undefined) {
  let below = Number.NEGATIVE_INFINITY;
  for (const node of column) {
    const point = at.get(node.id) as Point;
    const wanted = wish(node) ?? below;
    const y = Math.max(snap(wanted), below === Number.NEGATIVE_INFINITY ? Number.NEGATIVE_INFINITY : snapUp(below));
    point.y = Number.isFinite(y) ? y : 0;
    below = point.y + node.height + ROW_GAP;
  }
}

const snap = (value: number) => (Number.isFinite(value) ? Math.round(value / GRID) * GRID : value);
const snapUp = (value: number) => Math.ceil(value / GRID) * GRID;
