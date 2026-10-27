// The save profile of a document: which alternate recipes its save has unlocked (`settings.plugin.unlocked`, see
// `unlockedRecipes` in the plugin contract), and the edits that change it. The plugin's own settings (budgets) are
// field descriptors, edited like node fields.
import type { PackData, Recipe } from "../../../contracts/pack";
import { isAlternate, UNLOCKED_SETTING, unlockedRecipes } from "../../../contracts/plugin";

/** The pack's alternate recipes, by name. */
export function alternatesOf(pack: PackData): Recipe[] {
  return pack.recipes.filter(isAlternate).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
}

export function isUnlocked(settings: Record<string, unknown>, recipeId: string): boolean {
  return unlockedRecipes(settings)?.includes(recipeId) ?? true;
}

export function unlockedCount(pack: PackData, settings: Record<string, unknown>): number {
  return pack.recipes.filter((recipe) => isAlternate(recipe) && isUnlocked(settings, recipe.id)).length;
}

export type UnlockChange = { recipe: string; unlocked: boolean } | { all: boolean };

/** The settings to merge (null removes the list: no profile, everything unlocked) and the history label. */
export function unlockEdit(
  pack: PackData,
  settings: Record<string, unknown>,
  change: UnlockChange,
): { settings: Record<string, unknown>; label: string } {
  if ("all" in change) {
    return change.all
      ? { settings: { [UNLOCKED_SETTING]: null }, label: "Unlock all alternates" }
      : { settings: { [UNLOCKED_SETTING]: [] }, label: "Lock all alternates" };
  }
  const alternates = pack.recipes.filter(isAlternate);
  const unlocked = alternates
    .filter((recipe) => (recipe.id === change.recipe ? change.unlocked : isUnlocked(settings, recipe.id)))
    .map((recipe) => recipe.id);
  const name = nameOf(alternates.find((recipe) => recipe.id === change.recipe) ?? { id: change.recipe });
  return { settings: { [UNLOCKED_SETTING]: unlocked }, label: `${change.unlocked ? "Unlock" : "Lock"} ${name}` };
}

export function nameOf(recipe: Pick<Recipe, "id" | "name">): string {
  return recipe.name ?? recipe.id;
}
