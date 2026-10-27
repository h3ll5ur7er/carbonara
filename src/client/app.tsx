// The app shell: top bar over a full-bleed canvas, with slots for the side panels.
import { lazy, Suspense } from "react";
import { Canvas } from "./canvas/canvas";
import { TopBar } from "./top-bar";

/** Development only: `?scene=<name>` shows a canvas fixture scene (docs/Design.md, Visual QA). */
const sceneName = import.meta.env.DEV ? new URLSearchParams(location.search).get("scene") : null;
const SceneCanvas = import.meta.env.DEV ? lazy(() => import("./canvas/scenes/scene-canvas")) : null;

export function App() {
  return (
    <div className="flex h-dvh w-dvw flex-col overflow-hidden bg-canvas font-sans text-fg">
      <TopBar />
      <main className="relative min-h-0 flex-1">
        <div className="canvas-backdrop absolute inset-0">
          {sceneName && SceneCanvas ? (
            <Suspense>
              <SceneCanvas name={sceneName} />
            </Suspense>
          ) : (
            <Canvas />
          )}
        </div>
        {!sceneName && <EmptyState />}
        {/* Side panel slots, collapsed until panels exist. */}
        <aside aria-label="Left panel" className="absolute inset-y-3 left-3 hidden" />
        <aside aria-label="Right panel" className="absolute inset-y-3 right-3 hidden" />
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="canvas-clearing flex flex-col items-center gap-4 px-24 py-16 text-center">
        <GhostNode />
        <div className="flex flex-col gap-1">
          <p className="text-lg font-medium tracking-tight text-fg-muted">This factory is empty</p>
          <p className="text-sm text-fg-subtle">Machines and the flows between them will appear here.</p>
        </div>
      </div>
    </div>
  );
}

/** The outline of a node card with a port on each side. */
function GhostNode() {
  return (
    <svg viewBox="0 0 88 56" className="h-14 w-22 text-fg-faint" fill="none" aria-hidden>
      <rect x="8.5" y="0.5" width="71" height="55" rx="9.5" stroke="currentColor" strokeDasharray="4 3" />
      <rect x="20" y="15" width="20" height="4" rx="2" className="fill-current" />
      <rect x="20" y="25" width="36" height="3" rx="1.5" className="fill-current opacity-60" />
      <rect x="20" y="33" width="26" height="3" rx="1.5" className="fill-current opacity-60" />
      <circle cx="8.5" cy="28" r="4" className="fill-canvas" stroke="currentColor" />
      <circle cx="79.5" cy="28" r="4.5" className="fill-accent" />
    </svg>
  );
}
