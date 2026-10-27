// Quick-add: typing an item or recipe name in the command palette offers the recipes that make it, and picking
// one adds a node. Hides how a pack's recipes become palette entries and how an entry becomes an edit.
import type { Position } from "../../../contracts/document";
import type { PackData } from "../../../contracts/pack";
import type { Connector } from "../../core/connector";

export interface QuickAddEntry {
  recipeId: string;
  title: string;
  /** "Furnace · Clean Ferrite → Iron Plate" */
  detail: string;
  /** Searched besides the title: output names and aliases, building names, the recipe id. */
  keywords: string[];
}

export function quickAddEntries(pack: PackData): QuickAddEntry[] {
  const items = new Map(pack.items.map((item) => [item.id, item]));
  const buildings = new Map(pack.buildings.map((building) => [building.id, building]));
  const itemName = (id: string) => items.get(id)?.name ?? id;
  const buildingName = (id: string) => buildings.get(id)?.name ?? id;

  return pack.recipes.map((recipe) => {
    const outputs = Object.keys(recipe.out);
    const inputs = Object.keys(recipe.in);
    const title = recipe.name ?? itemName(outputs[0] ?? recipe.id);
    const building = buildingName(recipe.buildings[0] ?? "");
    const produces = `→ ${outputs.map(itemName).join(", ")}`;
    const flow = inputs.length > 0 ? `${inputs.map(itemName).join(", ")} ${produces}` : produces;
    return {
      recipeId: recipe.id,
      title,
      detail: `${building} · ${flow}`,
      keywords: [
        ...outputs.flatMap((id) => [itemName(id), ...(items.get(id)?.aliases ?? [])]),
        ...recipe.buildings.map(buildingName),
        recipe.id,
      ],
    };
  });
}

/** Adds a node running the entry's recipe at `position`, as one undo step. */
export function addRecipeNode(
  editing: Pick<Connector["editing"], "apply">,
  documentId: string,
  entry: QuickAddEntry,
  position: Position,
): ReturnType<Connector["editing"]["apply"]> {
  return editing.apply({
    documentId,
    commands: [{ type: "addNode", graph: "root", node: { kind: "recipe", recipe: entry.recipeId }, position }],
    label: `Add ${entry.title}`,
  });
}
