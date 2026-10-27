// Hides where a new node goes when the spot it was meant for is taken: the nearest place, in grid steps, where
// it keeps a grid step clear of every other node. New nodes never land on top of existing ones.
import type { Point } from "../adapter";
import type { NodeView } from "./scene";
import type { Rect } from "./snap";

/** What a new node must stay clear of: every node but the frames, which sit behind them. */
export function obstaclesOf(nodes: readonly NodeView[]): Rect[] {
  return nodes
    .filter((view) => view.kind !== "frame")
    .map((view) => ({ ...view.position, width: view.width, height: view.height }));
}

/** How far, in grid steps, the search looks before it gives up and goes past everything. */
const REACH = 64;

export function freeSpot(wanted: Rect, others: readonly Rect[], grid: number): Point {
  const at = (x: number, y: number): Rect => ({ ...wanted, x, y });
  const clear = (candidate: Rect) => others.every((other) => !near(candidate, other, grid));
  if (clear(wanted)) return { x: wanted.x, y: wanted.y };

  // Rings of growing distance; within one, the nearest first, below and to the right before above and left.
  for (let ring = 1; ring <= REACH; ring++) {
    const candidates: Point[] = [];
    for (let step = -ring; step <= ring; step++) {
      candidates.push({ x: step, y: ring }, { x: ring, y: step }, { x: step, y: -ring }, { x: -ring, y: step });
    }
    candidates.sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y) || b.y - a.y || b.x - a.x);
    for (const step of candidates) {
      const candidate = at(wanted.x + step.x * grid, wanted.y + step.y * grid);
      if (clear(candidate)) return { x: candidate.x, y: candidate.y };
    }
  }
  const bottom = Math.max(...others.map((other) => other.y + other.height));
  return { x: wanted.x, y: bottom + grid };
}

/** Closer than a grid step, or overlapping. */
function near(a: Rect, b: Rect, grid: number): boolean {
  return (
    a.x < b.x + b.width + grid &&
    b.x < a.x + a.width + grid &&
    a.y < b.y + b.height + grid &&
    b.y < a.y + a.height + grid
  );
}
