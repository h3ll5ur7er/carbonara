// Rules a pack's data must follow beyond its shape: every reference resolves, no id is defined twice.
import type { Issue } from "../../contracts/issues";
import type { PackData } from "../../contracts/pack";

export function checkReferences(data: PackData): Issue[] {
  const issues: Issue[] = [];
  const items = definedIds(data.items, "items", "Item", issues);
  const buildings = definedIds(data.buildings, "buildings", "Building", issues);
  definedIds(data.recipes, "recipes", "Recipe", issues);
  definedIds(data.logistics, "logistics", "Logistics", issues);

  const item = (id: string, path: Issue["path"]) => {
    if (!items.has(id)) issues.push({ path, message: `Unknown item '${id}'` });
  };
  const building = (id: string, path: Issue["path"]) => {
    if (!buildings.has(id)) issues.push({ path, message: `Unknown building '${id}'` });
  };

  data.recipes.forEach((recipe, r) => {
    recipe.buildings.forEach((id, b) => building(id, ["recipes", r, "buildings", b]));
    for (const id of Object.keys(recipe.in)) item(id, ["recipes", r, "in", id]);
    for (const id of Object.keys(recipe.out)) item(id, ["recipes", r, "out", id]);
  });
  data.resources.forEach((resource, r) => {
    item(resource.item, ["resources", r, "item"]);
    resource.extractors?.forEach((id, e) => building(id, ["resources", r, "extractors", e]));
  });
  return issues;
}

function definedIds(entries: { id: string }[], section: string, kind: string, issues: Issue[]): Set<string> {
  const ids = new Set<string>();
  entries.forEach(({ id }, index) => {
    if (ids.has(id)) issues.push({ path: [section, index, "id"], message: `${kind} '${id}' is defined twice` });
    ids.add(id);
  });
  return ids;
}
