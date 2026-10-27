// The recipes as nodes run them. A pack's plugin may change what a recipe takes and makes (Factorio's fuel, burnt
// fuel cells, quality variants), so the planner learns each candidate's items from the compiler instead of the pack:
// it compiles one node per recipe, runs each once, and reads the rates back. Pure: the manager compiles in between.
import type { Document, Node } from "../../contracts/document";
import type { Id, Recipe } from "../../contracts/pack";
import type { AnalysisResults } from "../../contracts/results";
import type { Model, Solution } from "../../contracts/solver";
import { own } from "../../utilities/records";

/** What a recipe takes and makes per second of one machine, as a node with default settings runs it. */
export interface RecipeRates {
  in: Record<Id, number>;
  out: Record<Id, number>;
}

const nodeOf = (recipe: Recipe) => `recipe:${recipe.id}`;

/** A document with one node per recipe, nothing connected. */
export function probeDocument(document: Document, recipes: Recipe[]): Document {
  const nodes: Record<string, Node> = {};
  for (const recipe of recipes) nodes[nodeOf(recipe)] = { kind: "recipe", recipe: recipe.id };
  return { ...document, graph: { nodes, edges: {} }, blueprints: {}, layout: {} };
}

/** Every node of the model running once, with nothing flowing: what the probe's results are read from. */
export function runningOnce(model: Model): Solution {
  return {
    activity: model.nodes.map(() => 1),
    flow: model.edges.map(() => 0),
    surplus: [],
    deficit: [],
    overflow: [],
    pinMisses: [],
  };
}

/** Each recipe's rates from the probe's results; a recipe its node couldn't compile is left out. */
export function ratesOf(results: AnalysisResults, recipes: Recipe[]): Map<Id, RecipeRates> {
  const rates = new Map<Id, RecipeRates>();
  for (const recipe of recipes) {
    const node = own(results.nodes, nodeOf(recipe));
    if (node) rates.set(recipe.id, { in: inOrder(node.inputs, recipe.in), out: inOrder(node.outputs, recipe.out) });
  }
  return rates;
}

/** The amounts with the recipe's own items first, in its order, so plans list their parts as the pack does. */
function inOrder(amounts: Record<Id, number>, listed: Record<Id, number>): Record<Id, number> {
  const keys = [...Object.keys(listed), ...Object.keys(amounts)].filter((key) => Object.hasOwn(amounts, key));
  return Object.fromEntries([...new Set(keys)].map((key) => [key, amounts[key] as number]));
}
