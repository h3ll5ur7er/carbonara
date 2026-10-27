// Scene `subgraph`: inside a copper wire line that a small factory places twice, with the breadcrumbs back up
// and the blueprint library beside it (src/client/canvas/scenes/subgraph.ts). The crumbs and the cards' open
// buttons switch between the factory and the inside, as in the app (without its transitions' backend).
import { useMemo, useState } from "react";
import { Canvas } from "../canvas/canvas";
import { subgraphScene, SUBGRAPH_BLUEPRINT } from "../canvas/scenes/subgraph";
import { ConnectorProvider } from "../core/connector";
import { BlueprintLibrary } from "../features/subgraphs/library-panel";
import { libraryEntries } from "../features/subgraphs/library";
import { Breadcrumbs } from "../features/subgraphs/breadcrumbs";
import { crumbsOf, instancesOf } from "../features/subgraphs/path";
import { AppShell } from "../shell/app-shell";
import { fakeConnector } from "./fake-backend";
import { templatePack } from "./template-pack";

const scene = subgraphScene(templatePack);
const path = [{ instance: "line-a", blueprint: SUBGRAPH_BLUEPRINT }];

export default function SubgraphScene() {
  const [inside, setInside] = useState(true);
  const connector = useMemo(
    () => fakeConnector({ packs: { getPackData: async () => templatePack, listPacks: async () => [] } }),
    [],
  );
  const { document } = scene;
  const graph = inside ? SUBGRAPH_BLUEPRINT : "root";
  const entries = useMemo(() => libraryEntries(document, templatePack, graph), [document, graph]);
  return (
    <ConnectorProvider connector={connector}>
      <AppShell
        document={{ id: document.id, name: document.name, packId: "template" }}
        library={
          <BlueprintLibrary
            entries={entries}
            placing={null}
            onPick={ignore}
            onPlaceInView={ignore}
            onDrop={ignore}
            onCancel={ignore}
          />
        }
        canvas={
          <div key={graph} className="canvas-backdrop absolute inset-0">
            <Canvas
              document={document}
              pack={templatePack}
              graph={graph}
              results={inside ? scene.inside : scene.root}
              onOpenSubgraph={() => setInside(true)}
              header={
                inside && (
                  <Breadcrumbs
                    crumbs={crumbsOf(document, path)}
                    instances={instancesOf(document, SUBGRAPH_BLUEPRINT)}
                    onLeaveTo={() => setInside(false)}
                    onRename={ignore}
                  />
                )
              }
            />
          </div>
        }
      />
    </ConnectorProvider>
  );
}

const ignore = () => undefined;
