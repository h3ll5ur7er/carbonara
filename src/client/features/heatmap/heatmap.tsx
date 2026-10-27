// The bottleneck heatmap: soft red and amber glows over the canvas where the factory is held back (flows near
// or over their belt's capacity, machines short of an input), while healthy flows fade. `H` toggles it.
import { Flame, X } from "lucide-react";
import { useMemo, useState } from "react";
import { create } from "zustand";
import type { Document } from "../../../contracts/document";
import type { PackData } from "../../../contracts/pack";
import type { AnalysisResults } from "../../../contracts/results";
import { createSceneBuilder } from "../../canvas/model/scene";
import { IconButton } from "../../ui/button";
import { heatSpots, type HeatSeverity } from "./heat";
import "./heatmap.css";

export const useHeatmap = create<{ on: boolean }>(() => ({ on: false }));

export function toggleHeatmap(): void {
  useHeatmap.setState(({ on }) => ({ on: !on }));
}

const COLOURS: Record<HeatSeverity, { colour: string; strength: number }> = {
  short: { colour: "var(--color-flow-over-capacity)", strength: 0.6 },
  over: { colour: "var(--color-flow-over-capacity)", strength: 0.6 },
  near: { colour: "var(--color-flow-near-capacity)", strength: 0.5 },
};

export interface HeatmapLayerProps {
  document: Document;
  pack: PackData;
  results: AnalysisResults | null;
}

/** The glows, in flow coordinates: the canvas draws it as its overlay. */
export function HeatmapLayer({ document, pack, results }: HeatmapLayerProps) {
  const [buildScene] = useState(createSceneBuilder);
  const spots = useMemo(() => {
    const scene = buildScene(document.graph, document.layout.root, pack);
    return heatSpots(scene, results?.documentId === document.id ? results : null);
  }, [buildScene, document, pack, results]);
  return (
    <svg
      className="heatmap-layer pointer-events-none absolute top-0 left-0 overflow-visible"
      width="1"
      height="1"
      aria-hidden
    >
      <defs>
        {(Object.keys(COLOURS) as HeatSeverity[]).map((severity) => (
          <radialGradient key={severity} id={`heat-${severity}`}>
            <stop
              offset="0%"
              style={{ stopColor: COLOURS[severity].colour, stopOpacity: COLOURS[severity].strength }}
            />
            <stop
              offset="55%"
              style={{ stopColor: COLOURS[severity].colour, stopOpacity: COLOURS[severity].strength / 3 }}
            />
            <stop offset="100%" style={{ stopColor: COLOURS[severity].colour, stopOpacity: 0 }} />
          </radialGradient>
        ))}
      </defs>
      {spots.map((spot, index) => (
        <circle key={index} cx={spot.x} cy={spot.y} r={spot.radius} fill={`url(#heat-${spot.severity})`} />
      ))}
    </svg>
  );
}

/** What the colours mean, at the top of the canvas while the heatmap is on. */
export function HeatmapLegend({ left, right }: { left: number; right: number }) {
  return (
    <div style={{ left, right }} className="pointer-events-none absolute top-3 z-10 flex justify-center">
      <div className="pointer-events-auto flex h-9 animate-fade-in items-center gap-3 rounded-full bg-glass py-1 pr-1.5 pl-1.5 shadow-panel backdrop-blur-glass">
        <span className="grid size-6 place-items-center rounded-full bg-danger-soft text-flow-over-capacity">
          <Flame className="size-3.5" aria-hidden />
        </span>
        <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Bottlenecks</span>
        <ul className="flex items-center gap-3 text-2xs text-fg-subtle" aria-label="Legend">
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-flow-over-capacity" aria-hidden /> Short or over capacity
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-flow-near-capacity" aria-hidden /> Near capacity
          </li>
        </ul>
        <IconButton label="Hide the heatmap" shortcut={["H"]} icon={<X />} size="sm" onClick={toggleHeatmap} />
      </div>
    </div>
  );
}
