// Renders the scene the URL names, or a list of all scenes. Loaded only in development (see `App`).
import { lazy, Suspense } from "react";
import { TooltipProvider } from "../ui/tooltip";
import { pickScene, scenes } from "./registry";

const pick = pickScene(location.search, scenes);
const SceneComponent = pick.kind === "scene" ? lazy(pick.scene.load) : null;

export default function SceneHost() {
  return (
    <TooltipProvider>
      {SceneComponent ? (
        <Suspense fallback={null}>
          <SceneComponent />
        </Suspense>
      ) : (
        <SceneIndex requested={pick.kind === "index" ? pick.requested : ""} />
      )}
    </TooltipProvider>
  );
}

function SceneIndex({ requested }: { requested: string }) {
  return (
    <main className="min-h-dvh bg-canvas p-10 font-sans text-fg">
      <h1 className="text-2xl font-semibold tracking-tight">Scenes</h1>
      <p className="mt-1 text-sm text-fg-subtle">
        {requested ? `There is no scene named “${requested}”. ` : ""}Fixed states of the UI for screenshot tests.
      </p>
      <ul className="mt-6 flex max-w-120 flex-col gap-1">
        {Object.entries(scenes).map(([name, scene]) => (
          <li key={name}>
            <a
              href={`?scene=${name}`}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-surface-3"
            >
              <span>{scene.title}</span>
              <span className="font-mono text-xs text-fg-subtle">
                {name}
                {scene.placeholder ? " · placeholder" : ""}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
