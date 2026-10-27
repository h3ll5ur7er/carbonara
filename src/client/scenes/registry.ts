// Dev-only scenes: fixed states of the UI for screenshot tests and visual QA, picked with `?scene=<name>`.
// Each scene loads lazily, so none of this reaches the production bundle (see `App`).
// To add one, export a component as the default of a module and register it below; canvas scenes live in
// `src/client/canvas/scenes/`. A placeholder stands in for a scene whose feature doesn't exist yet.
import type { ComponentType } from "react";

export interface Scene {
  title: string;
  load(): Promise<{ default: ComponentType }>;
  /** Marks a stand-in until the real scene is built; it renders the shell with a placeholder note. */
  placeholder?: true;
}

export type SceneRegistry = Record<string, Scene>;

export const scenes: SceneRegistry = {
  gallery: { title: "Primitives gallery", load: () => import("./gallery") },
  inspector: { title: "Side panels and the inspector", load: () => import("./inspector") },
  palette: { title: "Command palette with quick-add", load: () => import("./palette") },
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
