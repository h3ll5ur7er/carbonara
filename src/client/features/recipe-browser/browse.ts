// The recipe browser's rules: how a pack's recipes are described, grouped (by building, category or unlock), searched
// and laid out as rows. Pure, so it's tested without a UI; the panel (recipe-browser.tsx) renders what it returns.
// It lives in the client like the recipe picker's rules (../recipe-picker/picker.ts): it orders what one person sees
// while they type, which a round trip to a manager per key press would only slow down.
import type { Id, PackData, Recipe } from "../../../contracts/pack";
import type { ItemView } from "../../canvas/model/scene";

/** The ways the browser groups recipes. Category and unlock need the pack to say (pack format 1.2). */
export type GroupBy = "building" | "category" | "unlock";

export interface BrowsedRecipe {
  id: Id;
  title: string;
  /** What it's made for: its first output. */
  product: ItemView | undefined;
  /** The building it runs in by default (its first). */
  building: { id: Id; name: string };
  /** The names of what it takes, in the recipe's order. */
  inputs: string[];
  /** The names of what it makes. */
  outputs: string[];
  alternate: boolean;
  recycling: boolean;
  category: Id | undefined;
  unlock: Id | undefined;
  /** Lower-case text that typing is matched against. */
  search: string;
}

/** A group of recipes: one building's, category's or unlock's. */
export interface Shelf {
  /** `building:<id>`, `category:<id>`, `unlock:<id>`; an empty id for the recipes without one. */
  id: string;
  name: string;
  /** The wider heading the pack files the group under ("Tier 2"). */
  section?: string | undefined;
  /** For a building's group: the building, for its tile. */
  building?: Id | undefined;
  recipes: BrowsedRecipe[];
}

export type BrowserRow =
  | { kind: "section"; key: string; label: string | undefined }
  | { kind: "group"; key: string; shelf: Shelf; expanded: boolean }
  | { kind: "recipe"; key: string; recipe: BrowsedRecipe; shelf: Shelf };

/** Every recipe of the pack, described for the browser, in the pack's order. */
export function browsable(pack: PackData): BrowsedRecipe[] {
  const items = new Map(pack.items.map((item) => [item.id, item]));
  const buildings = new Map(pack.buildings.map((building) => [building.id, building]));
  const categories = new Map(pack.categories.map((group) => [group.id, group]));
  const unlocks = new Map(pack.unlocks.map((group) => [group.id, group]));
  const itemView = (id: Id): ItemView => {
    const item = items.get(id);
    return { id, name: item?.name ?? id, form: item?.form ?? "solid" };
  };
  return pack.recipes.map((recipe): BrowsedRecipe => {
    const outputs = Object.keys(recipe.out);
    const product = outputs[0] === undefined ? undefined : itemView(outputs[0]);
    const buildingId = recipe.buildings[0] ?? "";
    const building = { id: buildingId, name: buildings.get(buildingId)?.name ?? buildingId };
    const alternate = hasTag(recipe, "alternate");
    const category = recipe.category === undefined ? undefined : categories.get(recipe.category);
    const unlock = recipe.unlock === undefined ? undefined : unlocks.get(recipe.unlock);
    const itemWords = [...Object.keys(recipe.in), ...outputs].flatMap((id) => [
      itemView(id).name,
      ...(items.get(id)?.aliases ?? []),
    ]);
    const words = [
      recipe.name ?? product?.name ?? recipe.id,
      recipe.id,
      ...recipe.buildings.map((id) => buildings.get(id)?.name ?? id),
      ...itemWords,
      ...(alternate ? ["alternate"] : []),
      ...[category, unlock].flatMap((group) => (group ? [group.name, group.section ?? ""] : [])),
    ];
    return {
      id: recipe.id,
      title: recipe.name ?? product?.name ?? recipe.id,
      product,
      building,
      inputs: Object.keys(recipe.in).map((id) => itemView(id).name),
      outputs: outputs.map((id) => itemView(id).name),
      alternate,
      recycling: hasTag(recipe, "recycling"),
      category: recipe.category,
      unlock: recipe.unlock,
      search: words.join(" ").toLowerCase(),
    };
  });
}

/** The groupings the pack supports: by building always, by category and unlock when it lists them. */
export function groupOptions(pack: PackData): GroupBy[] {
  return [
    "building",
    ...(pack.categories.length > 0 ? (["category"] as const) : []),
    ...(pack.unlocks.length > 0 ? (["unlock"] as const) : []),
  ];
}

/**
 * The recipes in groups, in the pack's order of buildings, categories or unlocks: recipes without a category last
 * ("Other"), those without an unlock first ("From the start"). Within a group, recipes follow their main product's
 * name, a standard recipe before its alternates. Groups with no recipe are left out.
 */
export function shelves(recipes: BrowsedRecipe[], pack: PackData, by: GroupBy): Shelf[] {
  const groups: Shelf[] =
    by === "building"
      ? pack.buildings.map((building) => ({
          id: `building:${building.id}`,
          name: building.name,
          building: building.id,
          recipes: [],
        }))
      : by === "category"
        ? [
            ...pack.categories.map((group) => shelfOf("category", group)),
            { id: "category:", name: "Other", recipes: [] },
          ]
        : [
            { id: "unlock:", name: "From the start", recipes: [] },
            ...pack.unlocks.map((group) => shelfOf("unlock", group)),
          ];
  const byId = new Map(groups.map((group) => [group.id, group]));
  for (const recipe of recipes) {
    const key = by === "building" ? recipe.building.id : by === "category" ? recipe.category : recipe.unlock;
    let group = byId.get(`${by}:${key ?? ""}`);
    if (!group) {
      // A building the pack doesn't list (references are checked, so only in hand-made data): a group of its own.
      group = { id: `${by}:${key ?? ""}`, name: recipe.building.name, recipes: [] };
      byId.set(group.id, group);
      groups.push(group);
    }
    group.recipes.push(recipe);
  }
  for (const group of groups) group.recipes.sort(byProduct);
  return groups.filter((group) => group.recipes.length > 0);
}

/** The recipes matching every word typed; recycling only when asked for. Keeps their order. */
export function matching(recipes: BrowsedRecipe[], query: string, options: { recycling: boolean }): BrowsedRecipe[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return recipes.filter(
    (recipe) => (options.recycling || !recipe.recycling) && words.every((word) => recipe.search.includes(word)),
  );
}

/**
 * The recipes matching every word typed, best first: those whose name has every word, then those making an item that
 * has them, then the rest (what they take, where they run, what unlocks them). Within each, names starting with the
 * first word come first, standard recipes before alternates, then by name. Nothing typed finds nothing.
 */
export function searchRecipes(
  recipes: BrowsedRecipe[],
  query: string,
  options: { recycling: boolean },
): BrowsedRecipe[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const [first] = words;
  if (first === undefined) return [];
  const has = (text: string) => words.every((word) => text.toLowerCase().includes(word));
  const tier = (recipe: BrowsedRecipe) => (has(recipe.title) ? 0 : recipe.outputs.some(has) ? 1 : 2);
  return matching(recipes, query, options)
    .map((recipe) => ({ recipe, tier: tier(recipe), starts: recipe.title.toLowerCase().startsWith(first) }))
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        Number(b.starts) - Number(a.starts) ||
        Number(a.recipe.alternate) - Number(b.recipe.alternate) ||
        a.recipe.title.localeCompare(b.recipe.title),
    )
    .map(({ recipe }) => recipe);
}

/**
 * The rows of the browser: a heading where the section changes (an empty one after a section, for the groups the
 * pack files under none), each group, and the recipes of the groups that are open.
 */
export function browserRows(groups: Shelf[], expanded: (id: string) => boolean): BrowserRow[] {
  const rows: BrowserRow[] = [];
  let section: string | undefined;
  for (const shelf of groups) {
    if (shelf.section !== section) {
      rows.push({ kind: "section", key: `section:${shelf.section ?? ""}`, label: shelf.section });
      section = shelf.section;
    }
    const open = expanded(shelf.id);
    rows.push({ kind: "group", key: shelf.id, shelf, expanded: open });
    if (open) {
      for (const recipe of shelf.recipes) rows.push({ kind: "recipe", key: `${shelf.id}/${recipe.id}`, recipe, shelf });
    }
  }
  return rows;
}

function shelfOf(kind: "category" | "unlock", group: PackData["categories"][number]): Shelf {
  return { id: `${kind}:${group.id}`, name: group.name, section: group.section, recipes: [] };
}

function byProduct(a: BrowsedRecipe, b: BrowsedRecipe): number {
  const product = (recipe: BrowsedRecipe) => recipe.product?.name ?? recipe.title;
  return (
    product(a).localeCompare(product(b)) ||
    Number(a.alternate) - Number(b.alternate) ||
    Number(a.recycling) - Number(b.recycling) ||
    a.title.localeCompare(b.title)
  );
}

function hasTag(recipe: Recipe, tag: string): boolean {
  return recipe.tags?.includes(tag) === true;
}
