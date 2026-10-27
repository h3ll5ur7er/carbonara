// Scenes `sankey` and `heatmap`: the canonical congested graph (src/client/canvas/scenes/congested.ts) seen in
// the Sankey overview, or on the canvas with the bottleneck heatmap on.
import { useMemo, useState, type ComponentType } from "react";
import { Canvas } from "../canvas/canvas";
import { scenes } from "../canvas/scenes";
import { ConnectorProvider } from "../core/connector";
import { useHeatmap } from "../features/heatmap/heatmap";
import { useFactoryOverlays } from "../features/planner/factory-overlays";
import { useSankey } from "../features/sankey/sankey-view";
import { AppShell } from "../shell/app-shell";
import { fakeConnector } from "./fake-backend";
import { templatePack } from "./template-pack";

export function overviewScene(mode: "sankey" | "heatmap"): ComponentType {
  useSankey.setState({ open: mode === "sankey" });
  useHeatmap.setState({ on: mode === "heatmap" });
  return function OverviewScene() {
    const [{ document, results, title }] = useState(() => scenes.congested());
    const connector = useMemo(
      () => fakeConnector({ packs: { getPackData: async () => templatePack, listPacks: async () => [] } }),
      [],
    );
    const overlays = useFactoryOverlays({
      info: { id: document.id, name: title },
      document,
      pack: templatePack,
      results,
    });
    return (
      <ConnectorProvider connector={connector}>
        <AppShell
          document={{ id: document.id, name: title, packId: "template" }}
          canvas={
            <>
              <div className="canvas-backdrop absolute inset-0">
                <Canvas document={document} pack={templatePack} results={results} {...overlays.canvas} />
              </div>
              {overlays.layers}
            </>
          }
        />
      </ConnectorProvider>
    );
  };
}
