// Find: what a search for items, recipes and nodes turns up across the whole factory, subgraphs included; and
// the edits that swap a recipe for another (replace everywhere, or for the selected nodes). Pure, so it's
// tested without a UI.
import type { CommandInput } from "../../../contracts/commands";
import type { Document, Graph, LocalId, Node } from "../../../contracts/document";
import type { Id, PackData, Recipe } from "../../../contracts/pack";

export interface FindResult {
  /** `root` or the blueprint whose graph holds the node. */
  graph: string;
  nodeId: LocalId;
  kind: Node["kind"];
  title: string;
  /** The building, "Source", "Output" …. */
  detail: string;
  /** The factory or subgraph it's in. */
  where: string;
  /** The recipe it runs, for recipe nodes. */
  recipe?: Id;
}

/** Every node that matches each word of the query, root graph first, in document order. */
export function findInFactory(document: Document, pack: PackData, query: string): FindResult[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const names = namesOf(pack);
  const graphs: [string, string, Graph][] = [
    ["root", document.name, document.graph],
    ...Object.entries(document.blueprints).map(([id, blueprint]): [string, string, Graph] => [
      id,
      blueprint.name,
      blueprint.graph,
    ]),
  ];
  const results: FindResult[] = [];
  for (const [graph, where, { nodes }] of graphs) {
    for (const [nodeId, node] of Object.entries(nodes)) {
      const { title, detail, search } = describe(node, names, document);
      const text = [title, detail, ...search].join(" ").toLowerCase();
      if (!words.every((word) => text.includes(word))) continue;
      results.push({
        graph,
        nodeId,
        kind: node.kind,
        title,
        detail,
        where,
        ...(node.kind === "recipe" && { recipe: node.recipe }),
      });
    }
  }
  return results;
}

/** The recipes that make the same main product as `recipeId`: what it can be swapped for. */
export function alternativesFor(pack: PackData, recipeId: Id): Recipe[] {
  const main = mainProduct(pack.recipes.find((recipe) => recipe.id === recipeId));
  return pack.recipes.filter((recipe) => recipe.id !== recipeId && main !== undefined && mainProduct(recipe) === main);
}

/**
 * One batch that makes the nodes (by graph) run `recipe`, and drops their flows of items the new recipe neither
 * takes (flows in) nor makes (flows out).
 */
export function recipeChangeCommands(
  document: Document,
  pack: PackData,
  nodes: Record<string, LocalId[]>,
  recipeId: Id,
): CommandInput[] {
  const recipe = pack.recipes.find((candidate) => candidate.id === recipeId);
  const takes = new Set(Object.keys(recipe?.in ?? {}));
  const makes = new Set(Object.keys(recipe?.out ?? {}));
  return Object.entries(nodes).flatMap(([graph, ids]): CommandInput[] => {
    const shown = graph === "root" ? document.graph : document.blueprints[graph]?.graph;
    const changing = new Set(ids.filter((id) => shown?.nodes[id]?.kind === "recipe"));
    if (!shown || changing.size === 0) return [];
    const stale = Object.entries(shown.edges)
      .filter(
        ([, edge]) =>
          (changing.has(edge.to) && !takes.has(edge.item)) || (changing.has(edge.from) && !makes.has(edge.item)),
      )
      .map(([id]) => id);
    return [
      { type: "setRecipe", graph, ids: [...changing], recipe: recipeId },
      ...(stale.length > 0 ? [{ type: "disconnect" as const, graph, ids: stale }] : []),
    ];
  });
}

function mainProduct(recipe: Recipe | undefined): Id | undefined {
  return Object.keys(recipe?.out ?? {})[0];
}

interface Names {
  item(id: Id): string[];
  recipe(id: Id): Recipe | undefined;
  building(id: Id): string;
}

function namesOf(pack: PackData): Names {
  const items = new Map(pack.items.map((item) => [item.id, item]));
  const recipes = new Map(pack.recipes.map((recipe) => [recipe.id, recipe]));
  const buildings = new Map(pack.buildings.map((building) => [building.id, building]));
  return {
    item: (id) => {
      const item = items.get(id);
      return [item?.name ?? id, id, ...(item?.aliases ?? [])];
    },
    recipe: (id) => recipes.get(id),
    building: (id) => buildings.get(id)?.name ?? id,
  };
}

function describe(node: Node, names: Names, document: Document): { title: string; detail: string; search: string[] } {
  switch (node.kind) {
    case "recipe": {
      const recipe = names.recipe(node.recipe);
      const outputs = Object.keys(recipe?.out ?? {});
      const title = recipe?.name ?? names.item(outputs[0] ?? node.recipe)[0] ?? node.recipe;
      const building = names.building(node.building ?? recipe?.buildings[0] ?? "");
      const items = [...Object.keys(recipe?.in ?? {}), ...outputs].flatMap(names.item);
      return { title, detail: building, search: [node.recipe, ...items] };
    }
    case "source":
    case "sink":
    case "port": {
      const [name = node.item, ...more] = names.item(node.item);
      const detail = node.kind === "source" ? "Source" : node.kind === "sink" ? "Output" : "Port";
      return { title: name, detail, search: more };
    }
    case "instance":
      return { title: document.blueprints[node.blueprint]?.name ?? node.blueprint, detail: "Subgraph", search: [] };
    case "note":
      return { title: node.text, detail: "Note", search: [] };
    case "frame":
      return { title: node.label, detail: "Frame", search: [] };
    case "junction":
      return { title: "Junction", detail: "", search: [] };
  }
}
