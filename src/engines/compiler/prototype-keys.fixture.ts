// Test support for ids named after Object.prototype's keys (CARB-83). Ids are the games' own names, so an item,
// building or recipe can be called `constructor` (Satisfactory has one) or anything else a plain object inherits;
// counting by id into `{}` would then start from Object.prototype's member. The renamings give some of the template
// pack's ids those names; tests expect the same answers under the new names.
import fc from "fast-check";
import type { Document, Graph, Node } from "../../contracts/document";
import type { Id, PackData } from "../../contracts/pack";
import type { AnalysisResults, Diagnostic } from "../../contracts/results";
import { templatePack } from "./template.fixture";

/**
 * Every key a plain object inherits: `constructor`, `toString`, `valueOf` … but `__proto__`, which no pack or document
 * can carry: the `Id` pattern refuses it (as it refuses every other key here but `constructor`), and zod drops it
 * from the records it parses.
 */
export const PROTOTYPE_KEYS = Object.getOwnPropertyNames(Object.prototype).filter((key) => key !== "__proto__");

/** The template pack, whose ids the renamings rename. */
export const original = templatePack();

export interface Names {
  item: (id: Id) => Id;
  building: (id: Id) => Id;
  recipe: (id: Id) => Id;
}

/** Which ids get which key, as [id, key] pairs per kind; the same key may name an item, a building and a recipe. */
export interface Renaming {
  item: [Id, string][];
  building: [Id, string][];
  recipe: [Id, string][];
}

const pairs = (ids: Id[]) =>
  fc
    .shuffledSubarray(PROTOTYPE_KEYS, { minLength: 1, maxLength: Math.min(ids.length, PROTOTYPE_KEYS.length) })
    .chain((keys) =>
      fc
        .shuffledSubarray(ids, { minLength: keys.length, maxLength: keys.length })
        .map((chosen) => chosen.map((id, index): [Id, string] => [id, keys[index] as string])),
    );

export const renamings: fc.Arbitrary<Renaming> = fc.record({
  item: pairs(original.items.map((item) => item.id)),
  building: pairs(original.buildings.map((building) => building.id)),
  recipe: pairs(original.recipes.map((recipe) => recipe.id)),
});

export function namesOf(renaming: Renaming): Names {
  const rename = (table: Map<Id, string>) => (id: Id) => table.get(id) ?? id;
  return {
    item: rename(new Map(renaming.item)),
    building: rename(new Map(renaming.building)),
    recipe: rename(new Map(renaming.recipe)),
  };
}

/** Own keys of a record renamed; `Object.fromEntries` defines them, so even `__proto__` stays a key. */
export const renameKeys = <T>(record: Record<string, T>, rename: (id: string) => string): Record<string, T> =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [rename(key), value]));

export function renamePack(pack: PackData, to: Names): PackData {
  return {
    ...pack,
    items: pack.items.map((item) => ({ ...item, id: to.item(item.id) })),
    buildings: pack.buildings.map((building) => ({ ...building, id: to.building(building.id) })),
    recipes: pack.recipes.map((recipe) => ({
      ...recipe,
      id: to.recipe(recipe.id),
      buildings: recipe.buildings.map(to.building),
      in: renameKeys(recipe.in, to.item),
      out: renameKeys(recipe.out, to.item),
    })),
    resources: pack.resources.map((resource) => ({ ...resource, item: to.item(resource.item) })),
  };
}

export function renameNode(node: Node, to: Names): Node {
  switch (node.kind) {
    case "recipe":
      return {
        ...node,
        recipe: to.recipe(node.recipe),
        ...(node.building !== undefined && { building: to.building(node.building) }),
        ...(node.pin?.type === "rate" && { pin: { ...node.pin, item: to.item(node.pin.item) } }),
      };
    case "source":
    case "sink":
    case "port":
      return { ...node, item: to.item(node.item) };
    default:
      return node;
  }
}

function renameGraph(graph: Graph, to: Names): Graph {
  return {
    nodes: Object.fromEntries(Object.entries(graph.nodes).map(([id, node]) => [id, renameNode(node, to)])),
    edges: Object.fromEntries(
      Object.entries(graph.edges).map(([id, edge]) => [id, { ...edge, item: to.item(edge.item) }]),
    ),
  };
}

export function renameDocument(document: Document, to: Names): Document {
  return {
    ...document,
    graph: renameGraph(document.graph, to),
    blueprints: Object.fromEntries(
      Object.entries(document.blueprints).map(([id, blueprint]) => [
        id,
        { ...blueprint, graph: renameGraph(blueprint.graph, to) },
      ]),
    ),
  };
}

/** What the analysis says, with ids renamed: the answer expected of the renamed pack. */
export function renameResults(results: AnalysisResults, to: Names): AnalysisResults {
  return {
    ...results,
    nodes: Object.fromEntries(
      Object.entries(results.nodes).map(([id, node]) => [
        id,
        { ...node, inputs: renameKeys(node.inputs, to.item), outputs: renameKeys(node.outputs, to.item) },
      ]),
    ),
    diagnostics: results.diagnostics.map((diagnostic): Diagnostic =>
      "item" in diagnostic ? { ...diagnostic, item: to.item(diagnostic.item) } : diagnostic,
    ),
    totals: {
      raw: renameKeys(results.totals.raw, to.item),
      buildings: renameKeys(results.totals.buildings, to.building),
    },
  };
}
