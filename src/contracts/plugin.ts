// The API a game pack's plugin implements (docs/Architecture/Plugins.md). Every hook is optional.
// Hooks are added when a pack needs them, not before.
import type { Building, PackData, PackDataFile, Recipe } from "./pack";

export type FieldValue = number | string | boolean;

/** A node setting the inspector renders without plugin UI code. */
export type FieldDescriptor =
  | { kind: "number"; label: string; min: number; max: number; step?: number; unit?: string; default: number }
  | { kind: "choice"; label: string; options: string[]; default: string }
  | { kind: "toggle"; label: string; default: boolean };

/** What the plugin sees of the document and the pack. */
export interface PluginContext {
  pack: PackData;
  /** The document's settings for this plugin, such as a save profile with unlocked recipes. */
  settings: Record<string, unknown>;
}

export interface NodeContext {
  recipe: Recipe;
  building: Building;
  fields: Record<string, FieldValue>;
}

/** A recipe as one node runs it: amounts per craft and seconds per craft, all modifiers applied. */
export interface EffectiveRecipe {
  time: number;
  in: Record<string, number>;
  out: Record<string, number>;
}

export interface Plugin {
  id: string;
  /** Node fields for nodes running in this building. */
  nodeFields?(building: Building, context: PluginContext): Record<string, FieldDescriptor>;
  /** Whether the recipe may be used, e.g. alternates that aren't unlocked yet. */
  recipeAvailable?(recipe: Recipe, context: PluginContext): boolean;
  /** Pre-solve: the recipe as this node runs it. Must stay linear in the machine count. */
  effectiveRecipe?(node: NodeContext, context: PluginContext): EffectiveRecipe;
  /** Post-solve metrics; non-linear is fine here (e.g. the Satisfactory power curve). */
  derive?(node: NodeContext & { machines: number }, context: PluginContext): Record<string, number>;
  /** Maintainer tooling: regenerate the pack data from the game's own files. */
  importer?: {
    accepts: string[];
    run(files: Record<string, Uint8Array>): { data: PackDataFile; icons: Record<string, Uint8Array> };
  };
}

/** Identity function that gives plugin authors type checking. */
export function definePlugin(plugin: Plugin): Plugin {
  return plugin;
}
