// Where the canvas is in a document's subgraphs: the path of instances opened from the root graph, which graph
// that shows, what the breadcrumbs call each level, and what a new blueprint is called.
import type { Document, Graph, LocalId } from "../../../contracts/document";
import type { Id, PackData } from "../../../contracts/pack";

/** One opened instance: the node in the graph above, and the blueprint it places. */
export interface Crumb {
  instance: LocalId;
  blueprint: LocalId;
}

/** The graph a path shows: its innermost blueprint, or `root`. */
export function graphOf(path: readonly Crumb[]): string {
  return path.at(-1)?.blueprint ?? "root";
}

function graphNamed(document: Document, scope: string): Graph | undefined {
  return scope === "root" ? document.graph : document.blueprints[scope]?.graph;
}

/**
 * The path cut where an instance no longer places its blueprint (it was expanded, deleted or undone), so the
 * canvas never shows a graph that isn't reachable any more. The same path when it's whole.
 */
export function livePath(document: Document, path: readonly Crumb[]): readonly Crumb[] {
  let scope = "root";
  for (const [depth, crumb] of path.entries()) {
    const node = graphNamed(document, scope)?.nodes[crumb.instance];
    if (node?.kind !== "instance" || node.blueprint !== crumb.blueprint || !document.blueprints[crumb.blueprint]) {
      return path.slice(0, depth);
    }
    scope = crumb.blueprint;
  }
  return path;
}

/** Each level of the path for the breadcrumbs: the factory, then each blueprint opened. */
export function crumbsOf(document: Document, path: readonly Crumb[]): { label: string; depth: number }[] {
  return [
    { label: document.name || "Factory", depth: 0 },
    ...path.map((crumb, index) => ({
      label: document.blueprints[crumb.blueprint]?.name ?? crumb.blueprint,
      depth: index + 1,
    })),
  ];
}

/** How many instances of a blueprint the document places, in every graph. */
export function instancesOf(document: Document, blueprint: LocalId): number {
  const graphs = [document.graph, ...Object.values(document.blueprints).map((other) => other.graph)];
  return graphs.reduce(
    (count, graph) =>
      count +
      Object.values(graph.nodes).filter((node) => node.kind === "instance" && node.blueprint === blueprint).length,
    0,
  );
}

/**
 * A name for the blueprint that collapsing `ids` makes: after the items that leave the selection, main products
 * (a selected recipe's first output) rather than byproducts, or else after what its machines make: "Iron Plate
 * line", "Iron Plate & Steel line". Never one the document has already.
 */
export function blueprintName(document: Document, pack: PackData, scope: string, ids: readonly LocalId[]): string {
  const graph = graphNamed(document, scope);
  const selected = new Set(ids);
  const leaving = Object.values(graph?.edges ?? {})
    .filter((edge) => selected.has(edge.from) && !selected.has(edge.to))
    .map((edge) => edge.item);
  const made = ids.flatMap((id) => {
    const node = graph?.nodes[id];
    const recipe = node?.kind === "recipe" ? pack.recipes.find((candidate) => candidate.id === node.recipe) : undefined;
    return Object.keys(recipe?.out ?? {}).slice(0, 1);
  });
  const products = leaving.filter((item) => made.includes(item));
  const named = products.length > 0 ? products : leaving.length > 0 ? leaving : made;
  const items = [...new Set(named)].slice(0, 2);
  const itemName = (id: Id) => pack.items.find((item) => item.id === id)?.name ?? id;
  const base = items.length > 0 ? `${items.map(itemName).join(" & ")} line` : "Subgraph";
  const taken = new Set(Object.values(document.blueprints).map((blueprint) => blueprint.name));
  let name = base;
  for (let suffix = 2; taken.has(name); suffix++) name = `${base} ${suffix}`;
  return name;
}

/**
 * The document as if a blueprint's graph were its root graph, for views that read only the root graph (the
 * inspector, the heatmap, the totals): they then describe the graph on screen. The document itself for `root`.
 */
export function scopedTo(document: Document, scope: string): Document {
  const blueprint = document.blueprints[scope];
  if (scope === "root" || !blueprint) return document;
  return { ...document, graph: blueprint.graph, layout: { ...document.layout, root: document.layout[scope] ?? {} } };
}
