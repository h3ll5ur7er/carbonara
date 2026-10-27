// Shows a canvas fixture scene in the app shell, for development and screenshot tests (`?scene=chain`).
// Edits go through a scene backend, so dragging, connecting and picking work as they will in the app.
import { useEffect, useState, type ComponentType } from "react";
import type { Document } from "../../../contracts/document";
import type { PackData } from "../../../contracts/pack";
import type { Viewport } from "../adapter";
import { AppShell } from "../../shell/app-shell";
import { ConnectorProvider } from "../../core/connector";
import { templatePack } from "../../scenes/template-pack";
import { Canvas } from "../canvas";
import { createSceneBuilder } from "../model/scene";
import { createSceneBackend, type SceneBackend } from "./scene-backend";
import { scenes } from "./index";

declare global {
  interface Window {
    carbonaraScene?: SceneBackend | undefined;
  }
}

/**
 * A canvas scene for the registry (src/client/scenes/registry.ts): the app shell around the scene's canvas.
 * `?scene=<name>` shows the whole scene; add `&zoom=<zoom>` to look at it at that zoom, centred on
 * `&focus=<node id>` (or on the scene's first node).
 */
export function canvasScene(name: keyof typeof scenes): ComponentType {
  return function CanvasScene() {
    const [scene] = useState(() => scenes[name]());
    const [viewport] = useState(() => viewportFromQuery(scene.document, templatePack));
    const [document, setDocument] = useState(scene.document);
    const [backend] = useState(() => createSceneBackend(scene.document, templatePack, setDocument));
    useEffect(() => {
      window.carbonaraScene = backend;
    }, [backend]);

    return (
      <ConnectorProvider connector={backend.connector}>
        <AppShell
          document={{ id: document.id, name: scene.title, packId: document.pack.id }}
          canvas={
            <div className="canvas-backdrop absolute inset-0">
              <Canvas document={document} pack={templatePack} results={scene.results} {...(viewport && { viewport })} />
            </div>
          }
        />
      </ConnectorProvider>
    );
  };
}

/** The top bar's height: the canvas fills the window below it. */
const TOP_BAR_HEIGHT = 48;

function viewportFromQuery(document: Document, pack: PackData): Viewport | undefined {
  const query = new URLSearchParams(location.search);
  const zoom = Number(query.get("zoom"));
  if (!zoom) return undefined;
  const nodes = createSceneBuilder()(document.graph, document.layout.root, pack).nodes;
  const focus = nodes.find((node) => node.id === query.get("focus")) ?? nodes[0];
  if (!focus) return undefined;
  const centre = { x: focus.position.x + focus.width / 2, y: focus.position.y + focus.height / 2 };
  return {
    x: window.innerWidth / 2 - centre.x * zoom,
    y: (window.innerHeight - TOP_BAR_HEIGHT) / 2 - centre.y * zoom,
    zoom,
  };
}
