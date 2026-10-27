// Hides two selection rules: which nodes a freehand lasso takes, and how far an arrow key nudges.
import type { Point } from "../adapter";
import type { Rect } from "./snap";

/** The ids of the nodes whose centre lies inside the lasso's polygon. */
export function insideLasso(nodes: (Rect & { id: string })[], polygon: Point[]): string[] {
  if (polygon.length < 3) return [];
  return nodes
    .filter((node) => contains(polygon, { x: node.x + node.width / 2, y: node.y + node.height / 2 }))
    .map((node) => node.id);
}

/** Even–odd ray casting. */
function contains(polygon: Point[], point: Point): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    if (!a || !b) continue;
    const crosses = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

const DIRECTIONS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/** Big steps for long moves. */
const SHIFT_STEPS = 4;

/** An arrow key's move: a grid step, four with Shift, one flow unit with Alt (which also bypasses snapping). */
export function nudgeOffset(
  key: string,
  modifiers: { shiftKey: boolean; altKey: boolean },
  grid: number,
): Point | undefined {
  const direction = DIRECTIONS[key];
  if (!direction) return undefined;
  const step = modifiers.altKey ? 1 : grid * (modifiers.shiftKey ? SHIFT_STEPS : 1);
  return { x: direction.x * step, y: direction.y * step };
}
