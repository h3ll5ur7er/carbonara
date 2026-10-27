// The compiler's calls into a pack plugin's hooks, and what it checks of their answers. Hides the order of the
// hooks and how their answers become fields, recipes, constraints and diagnostics (docs/Architecture/Plugins.md).
// A plugin's answers are input like any other: values that don't fit are replaced or refused, never trusted.
import type { LocalId } from "../../contracts/document";
import type { Building, Id, PackData, Recipe } from "../../contracts/pack";
import type {
  EffectiveRecipe,
  FieldDescriptor,
  FieldValue,
  NodeContext,
  Plugin,
  PluginConstraint,
  PluginContext,
  PluginDescription,
  PluginNode,
} from "../../contracts/plugin";
import type { Diagnostic } from "../../contracts/results";
import type { Comparison, Constraint } from "../../contracts/solver";
import { formatNumber } from "../../utilities/numbers";

/** The plugin's view of the document settings: its settings fields checked, their defaults filled in. */
export function pluginContext(
  pack: PackData,
  plugin: Plugin,
  settings: Record<string, unknown> | undefined,
): { context: PluginContext; diagnostics: Diagnostic[] } {
  const raw = { pack, settings: settings ?? {} };
  const checked = checkFields(plugin.settingsFields?.(raw) ?? {}, raw.settings);
  return {
    context: { pack, settings: checked.values },
    diagnostics: checked.problems.map((message): Diagnostic => ({ kind: "warning", message })),
  };
}

/** The recipes the plugin says aren't available under these document settings (their defaults filled in). */
export function unavailableRecipes(
  pack: PackData,
  plugin: Plugin,
  settings: Record<string, unknown> | undefined,
): Id[] {
  if (!plugin.recipeAvailable) return [];
  const { context } = pluginContext(pack, plugin, settings);
  return pack.recipes.filter((recipe) => plugin.recipeAvailable?.(recipe, context) === false).map(({ id }) => id);
}

export interface PreparedNode {
  context: NodeContext;
  /** The recipe as the node runs it; undefined when the node can't be solved (see the diagnostics). */
  effective: EffectiveRecipe | undefined;
  diagnostics: Diagnostic[];
}

/** Runs the pre-solve hooks for one recipe node: fields, availability, validation, the effective recipe. */
export function prepareRecipeNode(
  plugin: Plugin,
  context: PluginContext,
  id: LocalId,
  recipe: Recipe,
  building: Building,
  values: Record<string, FieldValue> | undefined,
): PreparedNode {
  const diagnostics: Diagnostic[] = [];
  const say = (kind: "error" | "warning", message: string) => diagnostics.push({ kind, node: id, message });

  const checked = checkFields(plugin.nodeFields?.(building, context) ?? {}, values ?? {});
  checked.problems.forEach((message) => say("warning", message));
  // Documents only hold field values (see `Node` in the document contract), so the cast only narrows the type.
  const node: NodeContext = { recipe, building, fields: checked.values as Record<string, FieldValue> };

  if (plugin.recipeAvailable?.(recipe, context) === false)
    say("warning", `${recipeName(context.pack, recipe)} isn't unlocked`);
  const problems = plugin.validate?.(node, context) ?? [];
  problems.forEach((problem) => say(problem.kind === "error" ? "error" : "warning", String(problem.message)));
  if (problems.some((problem) => problem.kind === "error")) return { context: node, effective: undefined, diagnostics };

  const effective = plugin.effectiveRecipe?.(node, context) ?? { time: recipe.time, in: recipe.in, out: recipe.out };
  if (!isRecipe(effective)) {
    say("error", "The pack's plugin made an invalid recipe for this node");
    return { context: node, effective: undefined, diagnostics };
  }
  return { context: node, effective, diagnostics };
}

/** The plugin's constraints over recipe nodes, in model indices. Terms on other nodes are left out. */
export function pluginConstraints(
  plugin: Plugin,
  context: PluginContext,
  nodes: PluginNode[],
  index: Map<LocalId, number>,
): { constraints: Constraint[]; diagnostics: Diagnostic[] } {
  if (!plugin.constraints) return { constraints: [], diagnostics: [] };
  const recipeNodes = new Set(nodes.map((node) => node.id));
  const constraints: Constraint[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const constraint of plugin.constraints(nodes, context)) {
    if (!isConstraint(constraint)) {
      diagnostics.push({ kind: "error", message: "The pack's plugin made an invalid constraint" });
      continue;
    }
    const terms = constraint.terms.flatMap(({ node, coefficient }) => {
      const at = index.get(node);
      return at !== undefined && recipeNodes.has(node) ? [{ node: at, coefficient }] : [];
    });
    if (terms.length > 0) constraints.push({ terms, op: constraint.op, rhs: constraint.rhs });
  }
  return { constraints, diagnostics };
}

/** What a client needs to show the plugin's settings, without running its code. */
export function describePlugin(
  pack: PackData,
  plugin: Plugin,
  settings: Record<string, unknown> | undefined,
): PluginDescription {
  const { context } = pluginContext(pack, plugin, settings);
  const nodeFields: PluginDescription["nodeFields"] = {};
  for (const building of pack.buildings) {
    const fields = plugin.nodeFields?.(building, context) ?? {};
    if (Object.keys(fields).length > 0) nodeFields[building.id] = fields;
  }
  return {
    nodeFields,
    settingsFields: plugin.settingsFields?.(context) ?? {},
    metrics: plugin.metrics ?? {},
  };
}

/**
 * Every declared field with a value that fits its descriptor: the value given when it fits, else the nearest allowed
 * value or the default, with a problem saying so. Values of undeclared fields pass through.
 */
function checkFields(
  descriptors: Record<string, FieldDescriptor>,
  values: Record<string, unknown>,
): { values: Record<string, unknown>; problems: string[] } {
  const checked: Record<string, unknown> = { ...values };
  const problems: string[] = [];
  for (const [key, descriptor] of Object.entries(descriptors)) {
    const value = values[key];
    if (value === undefined) {
      checked[key] = descriptor.default;
      continue;
    }
    const fitted = fit(descriptor, value);
    checked[key] = fitted.value;
    if (fitted.problem) problems.push(`${descriptor.label} ${fitted.problem}`);
  }
  return { values: checked, problems };
}

function fit(descriptor: FieldDescriptor, value: unknown): { value: FieldValue; problem?: string } {
  const shown = JSON.stringify(value) ?? String(value);
  switch (descriptor.kind) {
    case "number": {
      const withUnit = (number: number) => `${formatNumber(number)}${descriptor.unit ? ` ${descriptor.unit}` : ""}`;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { value: descriptor.default, problem: `${shown} isn't a number; using ${withUnit(descriptor.default)}` };
      }
      const clamped = Math.min(descriptor.max, Math.max(descriptor.min, value));
      if (clamped === value) return { value };
      return { value: clamped, problem: `${withUnit(value)} is out of range; using ${withUnit(clamped)}` };
    }
    case "choice":
      if (typeof value === "string" && descriptor.options.includes(value)) return { value };
      return { value: descriptor.default, problem: `${shown} isn't one of its options; using "${descriptor.default}"` };
    case "toggle":
      if (typeof value === "boolean") return { value };
      return {
        value: descriptor.default,
        problem: `${shown} isn't on or off; using ${descriptor.default ? "on" : "off"}`,
      };
  }
}

const COMPARISONS: readonly Comparison[] = ["atMost", "equal", "atLeast"];

function isConstraint(value: unknown): value is PluginConstraint {
  if (typeof value !== "object" || value === null) return false;
  const { terms, op, rhs } = value as Record<string, unknown>;
  return (
    Array.isArray(terms) &&
    terms.every(
      (term: unknown) =>
        typeof term === "object" &&
        term !== null &&
        typeof (term as Record<string, unknown>).node === "string" &&
        Number.isFinite((term as Record<string, unknown>).coefficient),
    ) &&
    COMPARISONS.includes(op as Comparison) &&
    Number.isFinite(rhs)
  );
}

function isRecipe(value: unknown): value is EffectiveRecipe {
  if (typeof value !== "object" || value === null) return false;
  const { time, in: inputs, out } = value as Record<string, unknown>;
  const amounts = (side: unknown) =>
    typeof side === "object" &&
    side !== null &&
    Object.values(side).every((amount) => typeof amount === "number" && Number.isFinite(amount) && amount >= 0);
  return typeof time === "number" && Number.isFinite(time) && time > 0 && amounts(inputs) && amounts(out);
}

function recipeName(pack: PackData, recipe: Recipe): string {
  if (recipe.name) return recipe.name;
  const [main] = Object.keys(recipe.out);
  return pack.items.find((item) => item.id === main)?.name ?? recipe.id;
}
