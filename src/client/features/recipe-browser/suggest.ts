// What the factory on screen could use next, for the recipe browser's Suggested group: plain rules, no learning.
// Around the selection, recipes for its open ports (a maker for an input nothing feeds, a user for an output nothing
// takes); then, from the last solve, a maker for each input a machine is short of and a user for each output nothing
// takes, the largest first. Each suggestion says why and names the port it connects to. Pure, like browse.ts.
import type { Graph, LocalId } from "../../../contracts/document";
import type { Id, PackData, Recipe } from "../../../contracts/pack";
import type { AnalysisResults } from "../../../contracts/results";
import { own } from "../../../utilities/records";
import type { PortRef } from "../../canvas/edit-actions";

/** How many suggestions the browser shows at most. */
export const SUGGESTION_LIMIT = 5;

export interface Suggestion {
  recipe: Id;
  /** "Circuit lacks 0.2/s of Iron Plate". */
  reason: string;
  /** The port the suggested recipe connects to when added. */
  connectTo: PortRef;
}

export interface SuggestInput {
  /** The graph on screen. */
  graph: Graph;
  pack: PackData;
  /** The latest results for that graph, if any. */
  results: AnalysisResults | null;
  /** The nodes selected on screen. */
  selected: LocalId[];
  /** A rate as the document shows it: "2/s", "120/min". */
  rate(perSecond: number, item: Id): string;
}

export function suggest({ graph, pack, results, selected, rate }: SuggestInput): Suggestion[] {
  const items = new Map(pack.items.map((item) => [item.id, item]));
  const recipes = new Map(pack.recipes.map((recipe) => [recipe.id, recipe]));
  const raw = new Set(pack.resources.map((resource) => resource.item));
  const itemName = (id: Id) => items.get(id)?.name ?? id;
  const usage = new Map<Id, number>();
  for (const node of Object.values(graph.nodes)) {
    if (node.kind === "recipe") usage.set(node.recipe, (usage.get(node.recipe) ?? 0) + 1);
  }

  /** What a node is called in a reason: its recipe's name, or its item's with what it is ("Slag output"). */
  const titleOf = (id: LocalId): string | undefined => {
    const node = own(graph.nodes, id);
    if (node?.kind === "recipe") {
      const recipe = recipes.get(node.recipe);
      const first = Object.keys(recipe?.out ?? {})[0];
      return recipe?.name ?? (first ? itemName(first) : node.recipe);
    }
    if (node?.kind === "source") return `${itemName(node.item)} source`;
    if (node?.kind === "sink") return `${itemName(node.item)} output`;
    return undefined;
  };
  /** The items a node takes and makes: as its effective recipe has them, after the last solve. */
  const portsOf = (id: LocalId): { in: Id[]; out: Id[] } => {
    const node = own(graph.nodes, id);
    if (node?.kind === "recipe") {
      const effective = results?.effectiveItems && own(results.effectiveItems, id);
      const recipe = recipes.get(node.recipe);
      return effective ?? { in: Object.keys(recipe?.in ?? {}), out: Object.keys(recipe?.out ?? {}) };
    }
    if (node?.kind === "source") return { in: [], out: [node.item] };
    if (node?.kind === "sink") return { in: [node.item], out: [] };
    return { in: [], out: [] };
  };

  const found: Suggestion[] = [];
  const offered = new Set<Id>();
  const served = new Set<string>();
  /**
   * The best maker (side `in`: the port takes the item) or user (`out`) of the port's item. A port is served once,
   * and a recipe offered once, for its first reason.
   */
  const offer = (connectTo: PortRef, reason: (title: string, item: string) => string) => {
    const title = titleOf(connectTo.node);
    const port = `${connectTo.node}/${connectTo.side}/${connectTo.item}`;
    if (title === undefined || served.has(port) || (connectTo.side === "in" && raw.has(connectTo.item))) return;
    served.add(port);
    const [best] = (connectTo.side === "in" ? makersOf : usersOf)(pack.recipes, connectTo.item, usage);
    if (!best || offered.has(best.id)) return;
    offered.add(best.id);
    found.push({ recipe: best.id, reason: reason(title, itemName(connectTo.item)), connectTo });
  };

  const edges = Object.values(graph.edges);
  for (const node of selected) {
    const ports = portsOf(node);
    for (const item of ports.in) {
      if (edges.some((edge) => edge.to === node && edge.item === item)) continue;
      offer({ node, item, side: "in" }, (title, name) => `Makes ${name} for ${title}`);
    }
    for (const item of ports.out) {
      if (edges.some((edge) => edge.from === node && edge.item === item)) continue;
      offer({ node, item, side: "out" }, (title, name) =>
        name === title ? `Uses the ${name} it makes` : `Uses ${name} from ${title}`,
      );
    }
  }
  const slacks = (kind: "deficit" | "surplus") =>
    (results?.diagnostics ?? [])
      .flatMap((diagnostic) => (diagnostic.kind === kind ? [diagnostic] : []))
      .sort((a, b) => b.perSecond - a.perSecond);
  for (const { node, item, perSecond } of slacks("deficit")) {
    offer({ node, item, side: "in" }, (title, name) => `${title} lacks ${rate(perSecond, item)} of ${name}`);
  }
  for (const { node, item, perSecond } of slacks("surplus")) {
    offer(
      { node, item, side: "out" },
      (_title, name) => `Uses the ${rate(perSecond, item)} of ${name} nothing takes yet`,
    );
  }
  return found.slice(0, SUGGESTION_LIMIT);
}

/** Recipes that make the item, best first: as their main product, standard ones, the ones the factory uses. */
function makersOf(recipes: Recipe[], item: Id, usage: Map<Id, number>): Recipe[] {
  return ranked(
    recipes.filter((recipe) => own(recipe.out, item) !== undefined),
    usage,
    (recipe) => Object.keys(recipe.out)[0] === item,
  );
}

/** Recipes that take the item, best first: as their first ingredient, standard ones, the ones the factory uses. */
function usersOf(recipes: Recipe[], item: Id, usage: Map<Id, number>): Recipe[] {
  return ranked(
    recipes.filter((recipe) => own(recipe.in, item) !== undefined),
    usage,
    (recipe) => Object.keys(recipe.in)[0] === item,
  );
}

function ranked(recipes: Recipe[], usage: Map<Id, number>, main: (recipe: Recipe) => boolean): Recipe[] {
  const tagged = (recipe: Recipe, tag: string) => Number(recipe.tags?.includes(tag) === true);
  return recipes
    .filter((recipe) => !recipe.tags?.includes("recycling"))
    .sort(
      (a, b) =>
        Number(main(b)) - Number(main(a)) ||
        tagged(a, "alternate") - tagged(b, "alternate") ||
        (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) ||
        (a.name ?? a.id).localeCompare(b.name ?? b.id),
    );
}
