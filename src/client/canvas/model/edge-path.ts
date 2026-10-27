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
  const reach = Math.max(Math.abs(targetX - sourceX) / 2, 40);
  return `M${sourceX},${sourceY} C${sourceX + reach},${sourceY} ${targetX - reach},${targetY} ${targetX},${targetY}`;
}
