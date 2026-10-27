// Comparing recipes: which recipes are candidates for an item, and which of their plans is best.
import type { PlanOptions, ProposalSummary, RecipeComparison } from "../../contracts/managers";
import type { Id, PackData } from "../../contracts/pack";
import { allowedRecipes, makes } from "./superstructure";

/** The recipes the plan may use that make the item, in pack order. */
export function rivals(pack: PackData, unavailable: ReadonlySet<Id>, options: PlanOptions, item: Id): Id[] {
  return allowedRecipes(pack, unavailable, options)
    .filter((recipe) => makes(recipe, item))
    .map((recipe) => recipe.id);
}

/** Best first: what's met first, then what the objective minimises, then the other measure. */
export function rank(comparisons: RecipeComparison[], objective: PlanOptions["objective"]): RecipeComparison[] {
  const score = ({ summary }: RecipeComparison) => {
    const measures = [total(summary.raw), total(summary.buildings)];
    return [total(summary.shortfalls), ...(objective === "resources" ? measures : measures.reverse())];
  };
  return [...comparisons].sort((a, b) => {
    const [left, right] = [score(a), score(b)];
    const differs = left.findIndex((value, index) => !nearlyEqual(value, right[index] ?? 0));
    return differs < 0 ? 0 : (left[differs] ?? 0) - (right[differs] ?? 0);
  });
}

function total(amounts: ProposalSummary["raw"]): number {
  return Object.values(amounts).reduce((sum, amount) => sum + amount, 0);
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}
