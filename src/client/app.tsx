// The app's entry: the live app, or in development `?scene=<name>`, a fixed scene (src/client/scenes/registry.ts).
import { lazy, Suspense } from "react";
import { ClientModelsProvider } from "./core/models";
import { LiveApp } from "./live-app";

/**
 * Statically false in production builds, so the scenes are left out of the bundle. A build made with
 * `VITE_CANVAS_SCENES=true` keeps them, to measure the canvas with production React (docs/Design.md, Performance).
 */
const scenesBuilt = import.meta.env.DEV || import.meta.env.VITE_CANVAS_SCENES === "true";
const SceneHost =
  scenesBuilt && new URLSearchParams(location.search).has("scene") ? lazy(() => import("./scenes/host")) : null;

export function App() {
  if (SceneHost) {
    return (
      <Suspense fallback={null}>
        <SceneHost />
      </Suspense>
    );
  }
  return (
    <ClientModelsProvider>
      <LiveApp />
    </ClientModelsProvider>
  );
}
