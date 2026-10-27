// Hides the shape of a flow on the canvas: a smooth curve that leaves and enters its ports the way they face,
// and, for flows that run backwards (recycling loops), a rounded loop past both nodes so they never cut through
// a card: below them when flows run left to right, to their right when flows run down.

/** The edge of a node a port faces out of. */
export type Side = "left" | "right" | "top" | "bottom";

interface Point {
  x: number;
  y: number;
}

export interface PathEnds {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  /** Right when left out: flows run left to right. */
  sourceSide?: Side;
  /** Left when left out. */
  targetSide?: Side;
  /** For backward flows: where the loop runs, past both nodes (a y below them, or an x right of them). */
  loopAt?: number;
}

/** How far a backward flow leaves its port before turning, and the radius of its corners. */
const LOOP_RADIUS = 24;

const DIRECTIONS: Record<Side, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

/** Which way flows run between these ports, if it's one of the two the canvas lays out. */
function axisOf({ sourceSide = "right", targetSide = "left" }: PathEnds): "x" | "y" | undefined {
  if (sourceSide === "right" && targetSide === "left") return "x";
  if (sourceSide === "bottom" && targetSide === "top") return "y";
  return undefined;
}

/** Whether the flow runs against the way its ports face: its target is left of (or above) its source. */
export function isBackward(ends: PathEnds): boolean {
  const axis = axisOf(ends);
  if (axis === "x") return ends.targetX < ends.sourceX;
  if (axis === "y") return ends.targetY < ends.sourceY;
  return false;
}

export function flowPath(ends: PathEnds): string {
  const axis = axisOf(ends);
  if (!axis || !isBackward(ends) || ends.loopAt === undefined) {
    const [start, first, second, end] = controlPoints(ends);
    return `M${point(start)} C${point(first)} ${point(second)} ${point(end)}`;
  }
  return loop(ends, axis, ends.loopAt);
}

/**
 * A backward flow's loop, written along the flow (`a`) and across it (`b`): out of the source, across to `loopAt`,
 * back along it past the target, and into the target.
 */
function loop(ends: PathEnds, axis: "x" | "y", loopAt: number): string {
  const along = (x: number, y: number) => (axis === "x" ? [x, y] : [y, x]) as [number, number];
  const [sa, sb] = along(ends.sourceX, ends.sourceY);
  const [ta, tb] = along(ends.targetX, ends.targetY);
  const radius = Math.max(0, Math.min(LOOP_RADIUS, (loopAt - sb) / 2, (loopAt - tb) / 2));
  const at = (a: number, b: number) => (axis === "x" ? `${a},${b}` : `${b},${a}`);
  const out = sa + radius;
  const back = ta - radius;
  return [
    `M${at(sa, sb)}`,
    `Q${at(out, sb)} ${at(out, sb + radius)}`,
    `L${at(out, loopAt - radius)}`,
    `Q${at(out, loopAt)} ${at(sa, loopAt)}`,
    `L${at(ta, loopAt)}`,
    `Q${at(back, loopAt)} ${at(back, loopAt - radius)}`,
    `L${at(back, tb + radius)}`,
    `Q${at(back, tb)} ${at(ta, tb)}`,
  ].join(" ");
}

/** A cubic curve whose ends leave and enter the way their ports face, like a belt bending between machines. */
function controlPoints(ends: PathEnds): [Point, Point, Point, Point] {
  const { sourceX, sourceY, targetX, targetY, sourceSide = "right", targetSide = "left" } = ends;
  const towards = (side: Side, x: number, y: number) => {
    const direction = DIRECTIONS[side];
    const reach = Math.max(direction.x !== 0 ? Math.abs(targetX - sourceX) / 2 : Math.abs(targetY - sourceY) / 2, 40);
    return { x: x + direction.x * reach, y: y + direction.y * reach };
  };
  return [
    { x: sourceX, y: sourceY },
    towards(sourceSide, sourceX, sourceY),
    towards(targetSide, targetX, targetY),
    { x: targetX, y: targetY },
  ];
}

function point({ x, y }: Point): string {
  return `${x},${y}`;
}

/** Points along a forward flow's curve, ends included: what the flow passes over. */
export function flowPoints(ends: PathEnds, count: number): Point[] {
  const [a, b, c, d] = controlPoints(ends);
  const at = (t: number, pick: (p: Point) => number) => {
    const u = 1 - t;
    return u * u * u * pick(a) + 3 * u * u * t * pick(b) + 3 * u * t * t * pick(c) + t * t * t * pick(d);
  };
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    return { x: at(t, (p) => p.x), y: at(t, (p) => p.y) };
  });
}
