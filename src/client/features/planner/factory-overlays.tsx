// What the planner epic lays over a document's canvas, in one place so the app (and scenes) wire it once:
// the goal planner's card and its proposal's ghost, the totals card, the Sankey overview and the bottleneck
// heatmap with its legend.
import type { ReactNode } from "react";
import type { Document } from "../../../contracts/document";
import type { PackData } from "../../../contracts/pack";
import type { AnalysisResults } from "../../../contracts/results";
import type { CanvasProps } from "../../canvas/canvas";
import { usePanels } from "../../shell/panels";
import { HeatmapLayer, HeatmapLegend, useHeatmap } from "../heatmap/heatmap";
import { SankeyOverlay, useSankey } from "../sankey/sankey-view";
import { TotalsPanel, useTotalsReserved } from "../totals/totals-panel";
import { PlannerPanel, usePlannerCanvas } from "./planner-panel";

export interface FactoryOverlaysInput {
  info: { id: string; name: string } | null;
  document: Document | undefined;
  pack: PackData | undefined;
  results: AnalysisResults | null;
  /** The graph on screen (`document` is scoped to it): `root`, or a blueprint id. Plans go into it. */
  graph?: string | undefined;
}

export interface FactoryOverlays {
  /** For the document's `Canvas`. */
  canvas: Pick<CanvasProps, "ghost" | "onGhostPlace" | "reserved" | "overlay">;
  /** A proposal is on the canvas (an empty factory's hint would cover it). */
  previewing: boolean;
  /** The cards and views over the canvas. */
  layers: ReactNode;
}

const MARGIN = 12;

export function useFactoryOverlays({
  info,
  document,
  pack,
  results,
  graph = "root",
}: FactoryOverlaysInput): FactoryOverlays {
  const planner = usePlannerCanvas(document?.id, graph);
  const totals = useTotalsReserved();
  const heatmap = useHeatmap((state) => state.on);
  const sankey = useSankey((state) => state.open);
  const left = usePanels((panels) => (panels.left.open ? panels.left.width + 2 * MARGIN : MARGIN));
  const right = usePanels((panels) => (panels.right.open ? panels.right.width + 2 * MARGIN : MARGIN));
  const ready = info && document && pack ? { info, document, pack } : null;
  const rateUnit = ready ? (ready.document.settings.rateUnit ?? ready.pack.units.rate) : "per_minute";

  return {
    canvas: {
      ...planner,
      reserved: planner.reserved ?? totals,
      overlay:
        ready && heatmap ? <HeatmapLayer document={ready.document} pack={ready.pack} results={results} /> : undefined,
    },
    previewing: planner.ghost !== undefined,
    layers: ready && (
      <>
        <PlannerPanel
          document={{ id: ready.info.id, name: ready.info.name }}
          graph={graph}
          pack={ready.pack}
          rateUnit={rateUnit}
          planning={ready.document.settings.planning}
        />
        {heatmap && <HeatmapLegend left={left} right={right} />}
        <SankeyOverlay document={ready.document} pack={ready.pack} results={results} rateUnit={rateUnit} />
        {/* While the planner is open, its card sums up the proposal instead; the overview covers the canvas. */}
        {!planner.reserved && !sankey && (
          <TotalsPanel document={ready.document} pack={ready.pack} results={results} rateUnit={rateUnit} />
        )}
      </>
    ),
  };
}
