// Hides the shape of a flow on the canvas: a smooth curve for flows that run left to right, and a
// rounded loop below both nodes for flows that run backwards (recycling loops), so they never cut
// through a card.

export interface PathEnds {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  /** For backward flows: the height to loop at, below both nodes. */
  below?: number;
}

/** How far a backward flow leaves its port before turning, and the radius of its corners. */
const LOOP_RADIUS = 24;

export function isBackward(sourceX: number, targetX: number): boolean {
  return targetX < sourceX;
}

export function flowPath({ sourceX, sourceY, targetX, targetY, below }: PathEnds): string {
  if (!isBackward(sourceX, targetX) || below === undefined) return curve(sourceX, sourceY, targetX, targetY);
  const radius = Math.max(0, Math.min(LOOP_RADIUS, (below - sourceY) / 2, (below - targetY) / 2));
  const right = sourceX + radius;
  const left = targetX - radius;
  return [
    `M${sourceX},${sourceY}`,
    `Q${right},${sourceY} ${right},${sourceY + radius}`,
    `L${right},${below - radius}`,
    `Q${right},${below} ${sourceX},${below}`,
    `L${targetX},${below}`,
    `Q${left},${below} ${left},${below - radius}`,
    `L${left},${targetY + radius}`,
    `Q${left},${targetY} ${targetX},${targetY}`,
  ].join(" ");
}

/** A cubic curve leaving and entering horizontally, like a belt bending between two machines. */
function curve(sourceX: number, sourceY: number, targetX: number, targetY: number): string {
  const reach = curveReach(sourceX, targetX);
  return `M${sourceX},${sourceY} C${sourceX + reach},${sourceY} ${targetX - reach},${targetY} ${targetX},${targetY}`;
}

function curveReach(sourceX: number, targetX: number): number {
  return Math.max(Math.abs(targetX - sourceX) / 2, 40);
}

/** Points along a forward flow's curve, ends included: what the flow passes over. */
export function flowPoints(
  { sourceX, sourceY, targetX, targetY }: PathEnds,
  count: number,
): { x: number; y: number }[] {
  const reach = curveReach(sourceX, targetX);
  const xs = [sourceX, sourceX + reach, targetX - reach, targetX];
  const ys = [sourceY, sourceY, targetY, targetY];
  const at = (values: number[], t: number) => {
    const [a = 0, b = 0, c = 0, d = 0] = values;
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  };
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    return { x: at(xs, t), y: at(ys, t) };
  });
}
