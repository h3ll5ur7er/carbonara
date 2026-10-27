// Where the factory's bottlenecks are, as glowing spots in flow units: along flows near or over their belt's
// capacity (from port to port), and around machines short of an input, the hottest kind.
import type { LocalId } from "../../../contracts/document";
import type { AnalysisResults } from "../../../contracts/results";
import { flowSaturation, flowWidth } from "../../canvas/model/flow-style";
import type { CanvasScene, NodeView } from "../../canvas/model/scene";

export type HeatSeverity = "near" | "over" | "short";

export interface HeatSpot {
  x: number;
  y: number;
  radius: number;
  severity: HeatSeverity;
  /** What it marks: a flow or a node. */
  edge?: LocalId;
  node?: LocalId;
}

/** Room a flow's glow takes on each side, in flow units, on top of the flow's own width. */
const FLOW_GLOW = 56;
/** Spots along a flow are about this far apart. */
const STEP = 72;

export function heatSpots(scene: CanvasScene, results: AnalysisResults | null): HeatSpot[] {
  if (!results) return [];
  const views = new Map(scene.nodes.map((view) => [view.id, view]));
  const overflowing = new Set(
    results.diagnostics.flatMap((diagnostic) => (diagnostic.kind === "overflow" ? [diagnostic.edge] : [])),
  );
  const spots: HeatSpot[] = [];

  for (const edge of scene.edges) {
    const result = results.edges[edge.id];
    if (!result) continue;
    const saturation = flowSaturation({
      perSecond: result.perSecond,
      ...(result.capacity !== undefined && { capacity: result.capacity }),
      overflow: overflowing.has(edge.id),
    });
    if (saturation !== "near-capacity" && saturation !== "over-capacity") continue;
    const from = portOf(views.get(edge.source), edge.sourceHandle);
    const to = portOf(views.get(edge.target), edge.targetHandle);
    if (!from || !to) continue;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const count = Math.max(3, Math.ceil(length / STEP) + 1);
    const radius = FLOW_GLOW + flowWidth(result.perSecond);
    for (let index = 0; index < count; index++) {
      const t = index / (count - 1);
      spots.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        radius,
        severity: saturation === "over-capacity" ? "over" : "near",
        edge: edge.id,
      });
    }
  }

  const short = new Set(
    results.diagnostics.flatMap((diagnostic) => (diagnostic.kind === "deficit" ? [diagnostic.node] : [])),
  );
  for (const id of short) {
    const view = views.get(id);
    if (!view) continue;
    spots.push({
      x: view.position.x + view.width / 2,
      y: view.position.y + view.height / 2,
      radius: Math.max(view.width, view.height) * 0.75,
      severity: "short",
      node: id,
    });
  }
  return spots;
}

function portOf(view: NodeView | undefined, handle: string) {
  const port = view?.ports.find((candidate) => candidate.handle === handle);
  return view && port ? { x: view.position.x + port.x, y: view.position.y + port.y } : undefined;
}
