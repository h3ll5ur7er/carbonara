// Rules a pack's data must follow beyond its shape: every reference resolves, no id is defined twice.
import type { Graph } from "../../contracts/document";
import type { Issue } from "../../contracts/issues";
import type { PackData, Starter } from "../../contracts/pack";

type Check = (id: string, path: Issue["path"]) => void;

export function checkReferences(data: PackData): Issue[] {
  const issues: Issue[] = [];
  const items = definedIds(data.items, "items", "Item", issues);
  const buildings = definedIds(data.buildings, "buildings", "Building", issues);
  const recipes = definedIds(data.recipes, "recipes", "Recipe", issues);
  const logistics = definedIds(data.logistics, "logistics", "Logistics", issues);

  const known =
    (ids: Set<string>, kind: string): Check =>
    (id, path) => {
      if (!ids.has(id)) issues.push({ path, message: `Unknown ${kind} '${id}'` });
    };
  const item = known(items, "item");
  const building = known(buildings, "building");

  data.recipes.forEach((recipe, r) => {
    recipe.buildings.forEach((id, b) => building(id, ["recipes", r, "buildings", b]));
    for (const id of Object.keys(recipe.in)) item(id, ["recipes", r, "in", id]);
    for (const id of Object.keys(recipe.out)) item(id, ["recipes", r, "out", id]);
  });
  data.resources.forEach((resource, r) => {
    item(resource.item, ["resources", r, "item"]);
    resource.extractors?.forEach((id, e) => building(id, ["resources", r, "extractors", e]));
  });
  const checks: Checks = {
    item,
    building,
    recipe: known(recipes, "recipe"),
    logistics: known(logistics, "logistics"),
    node: (id, path) => issues.push({ path, message: `Unknown node '${id}'` }),
  };
  data.starters.forEach((starter, s) => checkStarter(starter, ["starters", s], checks));
  return issues;
}

type Checks = Record<"item" | "building" | "recipe" | "logistics", Check> & { node: Check };

/** A starter factory may only use the pack's recipes, buildings, items and belts, and connect nodes it has. */
function checkStarter(starter: Starter, at: Issue["path"], check: Checks): void {
  const graphs: [Graph, Issue["path"]][] = [
    [starter.graph, [...at, "graph"]],
    ...Object.entries(starter.blueprints).map(([id, blueprint]): [Graph, Issue["path"]] => [
      blueprint.graph,
      [...at, "blueprints", id, "graph"],
    ]),
  ];
  for (const [graph, path] of graphs) {
    for (const [id, node] of Object.entries(graph.nodes)) {
      const nodePath = [...path, "nodes", id];
      if (node.kind === "recipe") {
        check.recipe(node.recipe, [...nodePath, "recipe"]);
        if (node.building !== undefined) check.building(node.building, [...nodePath, "building"]);
        if (node.pin?.type === "rate") check.item(node.pin.item, [...nodePath, "pin", "item"]);
      } else if (node.kind === "source" || node.kind === "sink" || node.kind === "port") {
        check.item(node.item, [...nodePath, "item"]);
      }
    }
    const nodes = new Set(Object.keys(graph.nodes));
    for (const [id, edge] of Object.entries(graph.edges)) {
      const edgePath = [...path, "edges", id];
      for (const end of ["from", "to"] as const) {
        if (!nodes.has(edge[end])) check.node(edge[end], [...edgePath, end]);
      }
      check.item(edge.item, [...edgePath, "item"]);
      if (edge.logistics !== undefined) check.logistics(edge.logistics, [...edgePath, "logistics"]);
    }
  }
}

function definedIds(entries: { id: string }[], section: string, kind: string, issues: Issue[]): Set<string> {
  const ids = new Set<string>();
  entries.forEach(({ id }, index) => {
    if (ids.has(id)) issues.push({ path: [section, index, "id"], message: `${kind} '${id}' is defined twice` });
    ids.add(id);
  });
  return ids;
}
