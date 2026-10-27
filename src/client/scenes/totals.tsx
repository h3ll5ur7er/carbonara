// Scene `totals`: a gear and wire works planned on the template pack, with the totals card open. Ferrite runs
// near the map's limit and cuprite over it. The document and its results are the real engines' answers
// (totals.fixture.json, kept current by src/managers/planning.test.ts).
import { useMemo } from "react";
import type { Document } from "../../contracts/document";
import type { AnalysisResults } from "../../contracts/results";
import { Canvas } from "../canvas/canvas";
import { ConnectorProvider } from "../core/connector";
import { TotalsPanel, useTotals, useTotalsReserved } from "../features/totals/totals-panel";
import { AppShell } from "../shell/app-shell";
import { fakeConnector } from "./fake-backend";
import { templatePack } from "./template-pack";
import fixture from "./totals.fixture.json";

const { document, results } = fixture as unknown as { document: Document; results: AnalysisResults };

useTotals.setState({ expanded: true });

export default function TotalsScene() {
  const connector = useMemo(
    () => fakeConnector({ packs: { getPackData: async () => templatePack, listPacks: async () => [] } }),
    [],
  );
  const rateUnit = document.settings.rateUnit ?? templatePack.units.rate;
  const reserved = useTotalsReserved();
  return (
    <ConnectorProvider connector={connector}>
      <AppShell
        document={{ id: document.id, name: document.name, packId: "template" }}
        canvas={
          <>
            <div className="canvas-backdrop absolute inset-0">
              <Canvas document={document} pack={templatePack} results={results} reserved={reserved} />
            </div>
            <TotalsPanel document={document} pack={templatePack} results={results} rateUnit={rateUnit} />
          </>
        }
      />
    </ConnectorProvider>
  );
}
