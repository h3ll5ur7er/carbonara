// The superstructure: every way the pack could make the targets, as one document graph the compiler and the
// solver already understand. Each candidate recipe is a node; one hub (a junction) per item joins all of the
// item's producers to all of its consumers, so the solver picks the mix of recipes, cycles and byproducts
// included. Raw inputs are sources (capped at the map's limits), the targets are pinned sinks, and every
// item made spills what nobody uses into a free sink. Recipes run in the preferred building they allow.
import type { Document, Edge, LocalId, Node } from "../../contracts/document";
import type { Issue } from "../../contracts/issues";
import type { PlanOptions, PlanTarget } from "../../contracts/managers";
import type { Id, PackData, Recipe } from "../../contracts/pack";
import { fail, ok, type Result } from "../../contracts/result";
import { own } from "../../utilities/records";
import { toPerSecond } from "../../utilities/units";
import type { RecipeRates } from "./probe";

export interface SuperstructureInput {
  /** The document the plan is for: its id, pack and plugin settings carry over. */
  document: Document;
  pack: PackData;
  /** Recipes the pack's plugin rules out under the document's settings (`PluginRuntime.unavailableRecipes`). */
  unavailable?: ReadonlySet<Id>;
  targets: PlanTarget[];
  options: PlanOptions;
  /** Makes the targets with this recipe only, never from a raw source (to compare recipes). */
  via?: Id;
  /** The recipes as nodes run them (the plugin's fuel, by-products …); recipes not in it as the pack has them. */
  rates?: ReadonlyMap<Id, RecipeRates>;
}

/** What a superstructure node stands for. */
export type Role =
  | { kind: "recipe"; recipe: Id }
  | { kind: "raw"; item: Id }
  | { kind: "target"; item: Id }
  /** Takes what's made and not used: the plan's byproducts. */
  | { kind: "spill"; item: Id }
  | { kind: "hub"; item: Id };

export interface Superstructure {
  document: Document;
  roles: Record<LocalId, Role>;
  /** The targets, one per item. */
  targets: PlanTarget[];
}

export function buildSuperstructure({
  document,
  pack,
  unavailable = new Set(),
  targets,
  options,
  via,
  rates,
}: SuperstructureInput): Result<Superstructure> {
  const items = new Set(pack.items.map((item) => item.id));
  const issues: Issue[] = targets.flatMap((target, index) =>
    items.has(target.item)
      ? []
      : [{ path: ["targets", index, "item"], message: `The pack has no item "${target.item}"` }],
  );
  if (issues.length > 0) return fail(issues);

  const wanted = new Map<Id, number>();
  for (const target of targets) wanted.set(target.item, (wanted.get(target.item) ?? 0) + target.perSecond);

  const allowed = allowedRecipes(pack, unavailable, options);
  const run = (recipe: Recipe): RecipeRates => rates?.get(recipe.id) ?? recipe;
  const resources = new Map(pack.resources.map((resource) => [resource.item, resource]));

  // Walk upstream from the targets: each item's producers, then their inputs.
  const visited: Id[] = [];
  const recipes: Recipe[] = [];
  const queue = [...wanted.keys()];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const item = queue.shift() as Id;
    visited.push(item);
    const forced = via !== undefined && wanted.has(item);
    const producers = allowed.filter((candidate) => makes(run(candidate), item) && (!forced || candidate.id === via));
    for (const recipe of producers) {
      if (recipes.includes(recipe)) continue;
      recipes.push(recipe);
      for (const input of Object.keys(run(recipe).in)) {
        if (uses(run(recipe), input) && !seen.has(input)) {
          seen.add(input);
          queue.push(input);
        }
      }
    }
  }

  const nodes: Record<LocalId, Node> = {};
  const edges: Record<LocalId, Edge> = {};
  const roles: Record<LocalId, Role> = {};
  const add = (id: LocalId, node: Node, role: Role) => {
    nodes[id] = node;
    roles[id] = role;
  };
  const hub = (item: Id) => `hub:${item}`;

  for (const item of visited) {
    add(hub(item), { kind: "junction" }, { kind: "hub", item });
    const resource = resources.get(item);
    const madeHere = recipes.some((recipe) => makes(run(recipe), item));
    const forced = via !== undefined && wanted.has(item);
    if (!forced && (resource || !madeHere)) {
      const limit = resource?.limit;
      const source: Node = {
        kind: "source",
        item,
        ...(limit !== undefined && { maxPerSecond: toPerSecond(limit, pack.units.rate) }),
      };
      add(`raw:${item}`, source, { kind: "raw", item });
      edges[`raw:${item}>${hub(item)}`] = { from: `raw:${item}`, to: hub(item), item };
    }
  }
  const made: Id[] = [];
  for (const recipe of recipes) {
    const id = `recipe:${recipe.id}`;
    const building = buildingFor(recipe, options.buildings);
    const node: Node = { kind: "recipe", recipe: recipe.id, ...(building !== recipe.buildings[0] && { building }) };
    add(id, node, { kind: "recipe", recipe: recipe.id });
    // Catalysts (an item both used and made) are netted by the compiler: only a net input takes from the hub.
    for (const item of Object.keys(run(recipe).in)) {
      if (uses(run(recipe), item)) edges[`${hub(item)}>${id}`] = { from: hub(item), to: id, item };
    }
    for (const item of Object.keys(run(recipe).out)) {
      if (!makes(run(recipe), item)) continue;
      if (!(hub(item) in nodes)) add(hub(item), { kind: "junction" }, { kind: "hub", item });
      if (!made.includes(item)) made.push(item);
      edges[`${id}>${hub(item)}`] = { from: id, to: hub(item), item };
    }
  }
  for (const [item, perSecond] of wanted) {
    add(`target:${item}`, { kind: "sink", item, targetPerSecond: perSecond }, { kind: "target", item });
    edges[`${hub(item)}>target:${item}`] = { from: hub(item), to: `target:${item}`, item };
  }
  // What's made beyond what's used spills into a free output. Without one, the solver's last tier (fewer
  // unused outputs) would turn spare byproducts into other items within the cost tier's tolerance.
  for (const item of made) {
    add(`spill:${item}`, { kind: "sink", item }, { kind: "spill", item });
    edges[`${hub(item)}>spill:${item}`] = { from: hub(item), to: `spill:${item}`, item };
  }

  return ok({
    document: {
      ...document,
      name: `Plan for ${document.name}`,
      graph: { nodes, edges },
      blueprints: {},
      layout: {},
    },
    roles,
    targets: [...wanted].map(([item, perSecond]) => ({ item, perSecond })),
  });
}

/** The recipes the plan may use, in pack order. */
export function allowedRecipes(pack: PackData, unavailable: ReadonlySet<Id>, options: PlanOptions): Recipe[] {
  const excluded = new Set(options.exclude);
  return pack.recipes.filter(
    (recipe) =>
      !excluded.has(recipe.id) &&
      !unavailable.has(recipe.id) &&
      (options.alternates || !recipe.tags?.includes("alternate")),
  );
}

/** The building a recipe runs in: the first preferred building it allows, else its default. */
export function buildingFor(recipe: Recipe, preferred: readonly Id[]): Id {
  return preferred.find((building) => recipe.buildings.includes(building)) ?? (recipe.buildings[0] as Id);
}

/** Whether the recipe makes more of the item than it uses. */
export function makes(recipe: RecipeRates, item: Id): boolean {
  return (own(recipe.out, item) ?? 0) > (own(recipe.in, item) ?? 0);
}

/** Whether the recipe uses more of the item than it makes. */
function uses(recipe: RecipeRates, item: Id): boolean {
  return (own(recipe.in, item) ?? 0) > (own(recipe.out, item) ?? 0);
}
