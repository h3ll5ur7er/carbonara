// Scene `planner`: a small copper line with the goal planner's proposal for 15 motors a minute beside it, as a
// ghost with its summary card. The document, its results and the proposal are the real engines' answers
// (planner.fixture.json, kept current by src/managers/planning.test.ts). Accepting applies the proposal to the
// scene's document in memory; planning again answers with the same proposal.
import { produce } from "immer";
import { useMemo, useState } from "react";
import type { Document } from "../../contracts/document";
import type { Proposal } from "../../contracts/managers";
import { ok } from "../../contracts/result";
import type { AnalysisResults } from "../../contracts/results";
import { Canvas } from "../canvas/canvas";
import { ConnectorProvider } from "../core/connector";
import { PlannerPanel, usePlannerCanvas } from "../features/planner/planner-panel";
import { usePlanner } from "../features/planner/planner-store";
import { AppShell } from "../shell/app-shell";
import { fakeConnector } from "./fake-backend";
import fixture from "./planner.fixture.json";
import { templatePack } from "./template-pack";

const scene = fixture as unknown as { document: Document; results: AnalysisResults; proposal: Proposal };

usePlanner.setState({
  open: true,
  documentId: scene.document.id,
  stage: "proposal",
  goals: [{ key: 0, item: "motor", rate: 15 }],
  proposal: scene.proposal,
  offset: { x: 0, y: 0 },
  error: null,
});

export default function PlannerScene() {
  const [document, setDocument] = useState(scene.document);
  const connector = useMemo(
    () =>
      fakeConnector({
        editing: {
          applyProposal: async ({ offset }) => {
            setDocument((current) =>
              produce(current, (draft) => {
                for (const command of scene.proposal.commands) {
                  if (command.type === "addNode" && command.id) {
                    draft.graph.nodes[command.id] = command.node;
                    const { x, y } = command.position;
                    (draft.layout.root ??= {})[command.id] = { x: x + offset.x, y: y + offset.y };
                  } else if (command.type === "connect" && command.id) {
                    draft.graph.edges[command.id] = command.edge;
                  }
                }
              }),
            );
            return ok({ id: scene.document.id, name: scene.document.name, packId: "template", version: 2 });
          },
          undo: async () => {
            setDocument(scene.document);
            return { id: scene.document.id, name: scene.document.name, packId: "template", version: 3 };
          },
        },
        planning: { planProduction: async () => ok(scene.proposal), discardProposal: async () => ok(undefined) },
        packs: { getPackData: async () => templatePack, listPacks: async () => [] },
      }),
    [],
  );
  const planner = usePlannerCanvas(document.id);
  return (
    <ConnectorProvider connector={connector}>
      <AppShell
        document={{ id: document.id, name: document.name, packId: "template" }}
        canvas={
          <>
            <div className="canvas-backdrop absolute inset-0">
              <Canvas document={document} pack={templatePack} results={scene.results} {...planner} />
            </div>
            <PlannerPanel
              document={{ id: document.id, name: document.name }}
              pack={templatePack}
              rateUnit={document.settings.rateUnit ?? templatePack.units.rate}
            />
          </>
        }
      />
    </ConnectorProvider>
  );
}
