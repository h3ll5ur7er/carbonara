// Hides how a selection is tidied by hand: lined up on an edge or centre, spaced evenly, or a chain of flows
// straightened so they run level. Pure functions over the nodes' boxes; each result is one `moveNodes` edit,
// and only nodes that actually move are in it. Locked nodes never move: they are what the others line up on.
import type { LocalId } from "../../../contracts/document";
import type { Point } from "../adapter";
import type { CanvasScene } from "./scene";

export interface Box {
  id: LocalId;
  x: number;
  y: number;
  width: number;
  height: number;
  locked?: boolean;
}

export type AlignMode = "left" | "centre" | "right" | "top" | "middle" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

type Moves = Record<LocalId, Point>;

/** Lines the boxes up on the edge or centre line of their bounds (of the locked ones, when there are any). */
export function align(boxes: readonly Box[], mode: AlignMode): Moves {
  if (boxes.length < 2) return {};
  const locked = boxes.filter((box) => box.locked);
  const anchors = locked.length > 0 ? locked : boxes;
  const horizontal = mode === "left" || mode === "centre" || mode === "right";
  const start = Math.min(...anchors.map((box) => (horizontal ? box.x : box.y)));
  const end = Math.max(...anchors.map((box) => (horizontal ? box.x + box.width : box.y + box.height)));
  const moves: Moves = {};
  for (const box of boxes) {
    if (box.locked) continue;
    const size = horizontal ? box.width : box.height;
    const at =
      mode === "left" || mode === "top"
        ? start
        : mode === "right" || mode === "bottom"
          ? end - size
          : (start + end - size) / 2;
    const next = horizontal ? { x: at, y: box.y } : { x: box.x, y: at };
    if (next.x !== box.x || next.y !== box.y) moves[box.id] = next;
  }
  return moves;
}

/** Spaces the boxes so the gaps between them are equal, keeping the outermost two where they are. */
export function distribute(boxes: readonly Box[], axis: DistributeAxis): Moves {
  if (boxes.length < 3) return {};
  const horizontal = axis === "horizontal";
  const startOf = (box: Box) => (horizontal ? box.x : box.y);
  const sizeOf = (box: Box) => (horizontal ? box.width : box.height);
  const sorted = [...boxes].sort((a, b) => startOf(a) + sizeOf(a) / 2 - (startOf(b) + sizeOf(b) / 2));
  const first = sorted[0];
  const last = sorted.at(-1);
  if (!first || !last) return {};
  const span = startOf(last) + sizeOf(last) - startOf(first);
  const gap = (span - sorted.reduce((total, box) => total + sizeOf(box), 0)) / (sorted.length - 1);

  const moves: Moves = {};
  let at = startOf(first) + sizeOf(first) + gap;
  for (const box of sorted.slice(1, -1)) {
    // Whole flow units: no float noise in the document, at most a unit of unevenness.
    const rounded = Math.round(at);
    if (!box.locked && rounded !== startOf(box)) {
      moves[box.id] = horizontal ? { x: rounded, y: box.y } : { x: box.x, y: rounded };
    }
    at += sizeOf(box) + gap;
  }
  return moves;
}

/**
 * Moves the selected nodes up or down so the flows between them run level: from each node that no selected flow
 * feeds (left to right), every node it feeds is placed with its input port at the height of the output port.
 */
export function straightenChain(scene: CanvasScene, selected: readonly LocalId[]): Moves {
  const chosen = new Set(selected);
  const views = new Map(scene.nodes.filter((view) => chosen.has(view.id)).map((view) => [view.id, view]));
  const edges = scene.edges.filter((edge) => views.has(edge.source) && views.has(edge.target));
  const fed = new Set(edges.map((edge) => edge.target));
  const roots = [...views.values()].filter((view) => !fed.has(view.id)).sort((a, b) => a.position.x - b.position.x);

  const placed = new Map<LocalId, number>(roots.map((view) => [view.id, view.position.y]));
  const queue = roots.map((view) => view.id);
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    const y = placed.get(id) ?? 0;
    for (const edge of edges.filter((candidate) => candidate.source === id)) {
      const target = views.get(edge.target);
      if (!target || placed.has(target.id)) continue;
      const out = views.get(id)?.ports.find((port) => port.handle === edge.sourceHandle);
      const into = target.ports.find((port) => port.handle === edge.targetHandle);
      placed.set(target.id, target.locked || !out || !into ? target.position.y : y + out.y - into.y);
      queue.push(target.id);
    }
  }

  const moves: Moves = {};
  for (const [id, y] of placed) {
    const view = views.get(id);
    if (view && !view.locked && y !== view.position.y) moves[id] = { x: view.position.x, y };
  }
  return moves;
}
