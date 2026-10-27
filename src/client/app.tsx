// The app's entry: the live app, or in development `?scene=<name>`, a fixed scene (src/client/scenes/registry.ts).
import { lazy, Suspense } from "react";
import { ClientModelsProvider } from "./core/models";
import { LiveApp } from "./live-app";

/** Statically false in production builds, so the scenes are left out of the bundle. */
const SceneHost =
  import.meta.env.DEV && new URLSearchParams(location.search).has("scene") ? lazy(() => import("./scenes/host")) : null;

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
