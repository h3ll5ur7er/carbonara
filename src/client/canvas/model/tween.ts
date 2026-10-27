// Hides how nodes glide to where an edit put them (arranging, aligning, undoing a move): which moves animate,
// for how long, and where a node is part-way through.
import type { Point } from "../adapter";
import { GRID } from "./geometry";

export interface Move {
  from: Point;
  to: Point;
}

/** Moves up to this far take the base duration; longer ones the slow one, so a nudge never drags. */
const SHORT_MOVE = GRID * 4;

/** How long the moves take, given the motion tokens in ms (0 with reduced motion). */
export function tweenDuration(moves: Iterable<Move>, durations: { base: number; slow: number }): number {
  let longest = 0;
  for (const { from, to } of moves) longest = Math.max(longest, Math.hypot(to.x - from.x, to.y - from.y));
  if (longest === 0) return 0;
  return longest > SHORT_MOVE ? durations.slow : durations.base;
}

/** Where a move stands after `progress` (0–1) of its time, eased in and out. */
export function tweenAt({ from, to }: Move, progress: number): Point {
  const t = Math.min(Math.max(progress, 0), 1);
  const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
}
