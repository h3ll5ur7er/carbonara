// Dev-only scenes: fixed states of the UI for screenshot tests and visual QA, picked with `?scene=<name>`.
// Each scene loads lazily, so none of this reaches the production bundle (see `App`).
//
// To add one, export a component as the default of a module and register it below. Canvas scenes live in
// `src/client/canvas/scenes/`; register them here under the canonical names. A placeholder stands in for a
// canonical scene until its feature exists: replace its entry with the real scene and update the baselines.
import type { ComponentType } from "react";

export interface Scene {
  title: string;
  load(): Promise<{ default: ComponentType }>;
  /** Marks a stand-in until the real scene is built; it renders the shell with a placeholder note. */
  placeholder?: true;
}

export type SceneRegistry = Record<string, Scene>;

function canvasScene(name: "chain" | "congested" | "perf"): Promise<{ default: ComponentType }> {
  return import("../canvas/scenes/scene-canvas").then((module) => ({ default: module.canvasScene(name) }));
}

function placeholder(title: string, task: string): Scene {
  return {
    title,
    placeholder: true,
    load: () => import("./placeholder").then(({ placeholderScene }) => ({ default: placeholderScene(title, task) })),
  };
}

export const scenes: SceneRegistry = {
  // The canonical scenes of docs/Design.md (Visual QA), screenshot in dark and light by e2e/scenes.spec.ts.
  empty: { title: "Empty state", load: () => import("./empty") },
  chain: { title: "A 20-node chain", load: () => canvasScene("chain") },
  congested: { title: "A congested graph", load: () => canvasScene("congested") },
  subgraph: placeholder("Inside a subgraph", "CARB-39"),
  "ghost-paste": placeholder("The ghost paste", "CARB-51"),
  // The canvas perf harness (e2e/canvas-perf.spec.ts): 1,000 nodes.
  perf: { title: "1,000 nodes for the perf harness", load: () => canvasScene("perf") },
  // The design system and the shell.
  gallery: { title: "Primitives gallery", load: () => import("./gallery") },
  inspector: { title: "Side panels and the inspector", load: () => import("./inspector") },
  palette: { title: "Command palette with quick-add", load: () => import("./palette") },
  // Features.
  planner: { title: "The goal planner's proposal as a ghost", load: () => import("./planner") },
};

export type ScenePick =
  { kind: "app" } | { kind: "scene"; name: string; scene: Scene } | { kind: "index"; requested: string };

/** What the URL asks for: the app, a scene, or (for an empty or unknown name) the list of scenes. */
export function pickScene(search: string, registry: SceneRegistry): ScenePick {
  const name = new URLSearchParams(search).get("scene");
  if (name === null) return { kind: "app" };
  const scene = Object.hasOwn(registry, name) ? registry[name] : undefined;
  return scene ? { kind: "scene", name, scene } : { kind: "index", requested: name };
}
