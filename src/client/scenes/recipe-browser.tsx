// Scene `recipe-browser`: the library's recipe browser beside a small copper line of the template pack, with two
// favourites, three recent recipes and what the circuit assembler, short of iron plate, suggests next.
import { useMemo } from "react";
import { ok } from "../../contracts/result";
import { Canvas } from "../canvas/canvas";
import { buildScene } from "../canvas/scenes/build";
import { ConnectorProvider } from "../core/connector";
import { useRecipeMemory } from "../features/recipe-browser/memory";
import { suggest } from "../features/recipe-browser/suggest";
import { AppShell } from "../shell/app-shell";
import { fakeConnector } from "./fake-backend";
import { templatePack } from "./template-pack";

const scene = buildScene(templatePack, {
  name: "Circuit line",
  nodes: {
    copper: { node: { kind: "recipe", recipe: "copper-plate" }, x: 0, y: 96, machines: 1 },
    wire: { node: { kind: "recipe", recipe: "copper-wire" }, x: 360, y: 96, machines: 0.5 },
    circuits: { node: { kind: "recipe", recipe: "circuit" }, x: 720, y: 72, machines: 1 },
  },
  edges: {
    plates: { from: "copper", to: "wire", item: "copper-plate", perSecond: 0.33 },
    wires: { from: "wire", to: "circuits", item: "copper-wire", perSecond: 0.6 },
  },
  diagnostics: [
    { kind: "deficit", node: "circuits", item: "iron-plate", perSecond: 0.2 },
    { kind: "surplus", node: "copper", item: "slag", perSecond: 0.33 },
  ],
});
const document = { id: scene.document.id, name: scene.document.name, packId: "template" };
const suggestions = suggest({
  graph: scene.document.graph,
  pack: templatePack,
  results: scene.results,
  selected: [],
  rate: (perSecond) => `${perSecond}/s`,
});

useRecipeMemory.setState({
  recipes: { template: { favourites: ["motor", "circuit"], recent: ["copper-wire", "copper-plate", "iron-gear"] } },
});

export default function RecipeBrowserScene() {
  const connector = useMemo(
    () =>
      fakeConnector({
        packs: { getPackData: async () => templatePack },
        editing: { apply: async () => ok({ ...document, version: 2 }) },
      }),
    [],
  );
  return (
    <ConnectorProvider connector={connector}>
      <AppShell
        document={document}
        suggestions={suggestions}
        canvas={
          <div className="canvas-backdrop absolute inset-0">
            <Canvas document={scene.document} pack={templatePack} results={scene.results} />
          </div>
        }
      />
    </ConnectorProvider>
  );
}
