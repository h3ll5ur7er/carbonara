// The API a game pack's plugin implements (docs/Architecture/Plugins.md). Every hook is optional.
// Hooks are added when a pack needs them, not before.
import type { LocalId } from "./document";
import type { Building, Id, PackData, PackDataFile, Recipe } from "./pack";
import type { Comparison } from "./solver";

export type FieldValue = number | string | boolean;

/** A node setting the inspector renders without plugin UI code. */
export type FieldDescriptor =
  | { kind: "number"; label: string; min: number; max: number; step?: number; unit?: string; default: number }
  | { kind: "choice"; label: string; options: string[]; default: string }
  | { kind: "toggle"; label: string; default: boolean };

/** How the inspector names a metric that `derive` returns. */
export interface MetricDescriptor {
  label: string;
  unit?: string;
}

/** What the plugin sees of the document and the pack. */
export interface PluginContext {
  pack: PackData;
  /** The document's settings for this plugin (`settings.plugin`), such as a save profile with unlocked recipes. */
  settings: Record<string, unknown>;
}

export interface NodeContext {
  recipe: Recipe;
  building: Building;
  /** The node's field values: every field the plugin declares, checked against its descriptor, defaults filled in. */
  fields: Record<string, FieldValue>;
}

/** A recipe node as the `constraints` hook sees it. */
export interface PluginNode extends NodeContext {
  id: LocalId;
}

/** A recipe as one node runs it: amounts per craft and seconds per craft, all modifiers applied. */
export interface EffectiveRecipe {
  time: number;
  in: Record<string, number>;
  out: Record<string, number>;
}

/** `Σ coefficient · machines(node)  op  rhs` over recipe nodes, by id. Hard: a solve that can't meet it fails. */
export interface PluginConstraint {
  terms: { node: LocalId; coefficient: number }[];
  op: Comparison;
  rhs: number;
}

/** Something wrong with a node's settings, shown on the node. */
export interface PluginProblem {
  kind: "error" | "warning";
  message: string;
}

export interface Plugin {
  id: string;
  /** Node fields for nodes running in this building. */
  nodeFields?(building: Building, context: PluginContext): Record<string, FieldDescriptor>;
  /** Document-wide settings (budgets of a save profile), stored in `settings.plugin` and shown in the Save profile. */
  settingsFields?(context: PluginContext): Record<string, FieldDescriptor>;
  /** How the inspector names the metrics `derive` returns, by key. */
  metrics?: Record<string, MetricDescriptor>;
  /** Whether the recipe may be used, e.g. alternates that aren't unlocked yet. */
  recipeAvailable?(recipe: Recipe, context: PluginContext): boolean;
  /** Pre-solve: the recipe as this node runs it. Must stay linear in the machine count. */
  effectiveRecipe?(node: NodeContext, context: PluginContext): EffectiveRecipe;
  /** Pre-solve: linear constraints over machine counts, such as a global budget of a scarce item. */
  constraints?(nodes: PluginNode[], context: PluginContext): PluginConstraint[];
  /** Pre-solve: what's wrong with a node's settings, shown as warnings or errors on it. */
  validate?(node: NodeContext, context: PluginContext): PluginProblem[];
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

/** What a client needs to show a plugin's settings and metrics without running its code (`packs.describePlugin`). */
export interface PluginDescription {
  /** Node fields by building id; buildings without fields are left out. */
  nodeFields: Record<Id, Record<string, FieldDescriptor>>;
  settingsFields: Record<string, FieldDescriptor>;
  metrics: Record<string, MetricDescriptor>;
}

/**
 * The save profile's unlocked alternate recipes: `settings.plugin.unlocked`, a list of recipe ids. The Save profile
 * panel edits it and plugins read it in `recipeAvailable`. Undefined (no profile) means every alternate is unlocked.
 */
export const UNLOCKED_SETTING = "unlocked";

export function unlockedRecipes(settings: Record<string, unknown>): Id[] | undefined {
  const unlocked = settings[UNLOCKED_SETTING];
  return Array.isArray(unlocked) ? unlocked.filter((id): id is Id => typeof id === "string") : undefined;
}

/** Recipes the save profile governs: those tagged `alternate`. */
export const isAlternate = (recipe: Recipe): boolean => recipe.tags?.includes("alternate") === true;
