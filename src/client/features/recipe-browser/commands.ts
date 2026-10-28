// The recipe browser's commands for the app's registry: starring the recipes the selected machines run, from the
// palette and the node's context menu.
import { Star } from "lucide-react";
import { canvasEditActions } from "../../canvas/edit-actions";
import type { CommandDefinition } from "../../core/commands";
import { toast } from "../../shell/toasts";
import { isFavourite, toggleFavourite } from "./memory";

/** The selected machines' recipes, and whether they're all favourites already. */
function target() {
  const selected = canvasEditActions()?.selectedRecipes();
  if (!selected || selected.recipes.length === 0) return null;
  const starred = selected.recipes.every((recipe) => isFavourite(selected.packId, recipe));
  return { ...selected, starred };
}

export const recipeCommands: CommandDefinition[] = [
  {
    id: "recipe.toggleFavourite",
    title: "Favourite recipe",
    group: "Edit",
    keywords: ["star", "favourite", "favorite", "pin", "recipes", "unstar"],
    icon: Star,
    menuTitle: () => {
      const recipes = target();
      if (!recipes) return null;
      return recipes.starred ? "Remove from favourites" : "Add to favourites";
    },
    run: () => {
      const recipes = target();
      if (!recipes) {
        toast({ title: "No recipe selected", description: "Select a machine to favourite its recipe." });
        return;
      }
      for (const recipe of recipes.recipes) toggleFavourite(recipes.packId, recipe, !recipes.starred);
      const count = recipes.recipes.length === 1 ? "Recipe" : `${recipes.recipes.length} recipes`;
      toast({
        tone: "success",
        title: recipes.starred ? `${count} removed from favourites` : `${count} added to favourites`,
      });
    },
  },
];
