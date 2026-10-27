// Hides how the factory canvas is drawn (React Flow today); the CanvasAdapter seam grows out of this.
import { Background, BackgroundVariant, ReactFlow } from "@xyflow/react";

/** Grid pitch in flow units; dots sit on its multiples, so later snapping lines up with them. */
const gridGap = 24;
const majorGridEvery = 4;
const dotSize = 1.5;
const majorDotSize = 2;

export function Canvas() {
  return (
    <ReactFlow nodes={[]} edges={[]} aria-label="Factory canvas">
      <Background
        id="minor"
        variant={BackgroundVariant.Dots}
        gap={gridGap}
        size={dotSize}
        offset={centredOnGrid(gridGap, dotSize)}
        color="var(--color-grid-dot)"
      />
      <Background
        id="major"
        variant={BackgroundVariant.Dots}
        gap={gridGap * majorGridEvery}
        size={majorDotSize}
        offset={centredOnGrid(gridGap * majorGridEvery, majorDotSize)}
        color="var(--color-grid-dot-major)"
      />
    </ReactFlow>
  );
}

/** React Flow shifts dots by half a gap; this offset puts their centres on multiples of the gap instead. */
function centredOnGrid(gap: number, size: number) {
  return size / 2 - gap / 2;
}
