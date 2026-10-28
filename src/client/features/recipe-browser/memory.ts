// The recipes a person reaches for, per pack: favourites they star and the ones they added last. The recipe browser
// and quick-add put them first. Kept in the person's preferences (`workspace.getPreferences` / `setPreferences`), so
// they survive restarts; this store mirrors them for the session and saves every change.
import { useEffect } from "react";
import { create } from "zustand";
import type { Id } from "../../../contracts/pack";
import type { RecipeMemory } from "../../../contracts/preferences";
import { own } from "../../../utilities/records";
import { useConnector } from "../../core/connector";

/** How many recently added recipes are remembered per pack. */
export const RECENT_LIMIT = 8;

const NONE: RecipeMemory = { favourites: [], recent: [] };

interface MemoryState {
  /** Whether the preferences have been read; changes before that would overwrite them. */
  loaded: boolean;
  recipes: Record<string, RecipeMemory>;
}

export const useRecipeMemory = create<MemoryState>(() => ({ loaded: false, recipes: {} }));

/** The list of recent recipes once `id` was added: newest first, each once, at most `limit`. */
export function withRecent(recent: Id[], id: Id, limit = RECENT_LIMIT): Id[] {
  return [...new Set([id, ...recent])].slice(0, limit);
}

/** The favourites with `id` starred (at the end) or unstarred. */
export function withFavourite(favourites: Id[], id: Id, starred: boolean): Id[] {
  const others = favourites.filter((other) => other !== id);
  return starred ? [...others, id] : others;
}

/** What is remembered for a pack. */
export function memoryOf(recipes: Record<string, RecipeMemory>, packId: string | undefined): RecipeMemory {
  return (packId === undefined ? undefined : own(recipes, packId)) ?? NONE;
}

export function useMemoryOf(packId: string | undefined): RecipeMemory {
  return useRecipeMemory((state) => memoryOf(state.recipes, packId));
}

export function isFavourite(packId: string, recipeId: Id): boolean {
  return memoryOf(useRecipeMemory.getState().recipes, packId).favourites.includes(recipeId);
}

/** Stars the recipe, or unstars it; `starred` defaults to the opposite of now. */
export function toggleFavourite(packId: string, recipeId: Id, starred = !isFavourite(packId, recipeId)): void {
  change(packId, (memory) => ({ ...memory, favourites: withFavourite(memory.favourites, recipeId, starred) }));
}

/** Notes that the recipe was just added to a factory of the pack. */
export function rememberAdded(packId: string, recipeId: Id): void {
  change(packId, (memory) => ({ ...memory, recent: withRecent(memory.recent, recipeId) }));
}

function change(packId: string, update: (memory: RecipeMemory) => RecipeMemory): void {
  useRecipeMemory.setState((state) => ({
    recipes: { ...state.recipes, [packId]: update(memoryOf(state.recipes, packId)) },
  }));
}

/** Loads the remembered recipes from the preferences, then saves each change there. Mounted once, by the shell. */
export function useRecipeMemoryInPreferences(): void {
  const connector = useConnector();
  useEffect(() => {
    let current = true;
    connector.workspace.getPreferences({}).then(
      (preferences) => {
        if (!current) return;
        // Anything starred before the preferences arrived (a fast click) is kept on top of them.
        const changed = useRecipeMemory.getState().recipes;
        useRecipeMemory.setState({ loaded: true, recipes: { ...preferences.recipes, ...changed } });
      },
      // Without stored preferences (no storage) the session still remembers.
      () => current && useRecipeMemory.setState({ loaded: true }),
    );
    const unsubscribe = useRecipeMemory.subscribe((state, previous) => {
      // Loading isn't a change to save.
      if (!previous.loaded || state.recipes === previous.recipes) return;
      connector.workspace.setPreferences({ preferences: { recipes: state.recipes } }).catch(() => undefined);
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [connector]);
}
