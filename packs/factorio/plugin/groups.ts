// How Factorio arranges its recipes, for the recipe browser's groups. Hides the game's two arrangements: the crafting
// menu's tabs and rows (item groups and their subgroups), which become categories, and the technologies that unlock
// recipes, which become unlocks, ordered by the science packs they need and by how deep they sit in the tree.
import type { RecipeGroup } from "../../../src/contracts/pack";
import { humanise, localise, type Locale } from "./locale";

type Prototype = Record<string, unknown> & { name: string };
type Dump = Record<string, Record<string, Prototype> | undefined>;

/** Sorts after every order string the game uses, for prototypes without one. */
const LAST = "￿";

/** The crafting menu's rows a pack's recipes are in, as categories. */
export interface Categories {
  /** Marks the row as holding a recipe and answers its category id. */
  use(subgroup: string): string;
  /** The rows that hold recipes: by tab, then by row, as the crafting menu shows them. */
  list(): RecipeGroup[];
}

export function menuCategories(dump: Dump, locale: Locale): Categories {
  const subgroups = dump["item-subgroup"] ?? {};
  const groups = dump["item-group"] ?? {};
  const used = new Set<string>();
  const groupOf = (subgroup: string) => {
    const name = subgroups[subgroup]?.group;
    return typeof name === "string" ? groups[name] : undefined;
  };
  const key = (subgroup: string): [string, string, string] => [
    orderOf(groupOf(subgroup)),
    orderOf(subgroups[subgroup]),
    subgroup,
  ];
  return {
    use(subgroup) {
      used.add(subgroup);
      return subgroup;
    },
    list: () =>
      [...used]
        .sort((a, b) => compareKeys(key(a), key(b)))
        .map((subgroup) => {
          const group = groupOf(subgroup);
          const section =
            group && (localise(group.localised_name, locale) ?? locale.get(`item-group-name.${group.name}`));
          return { id: subgroup, name: humanise(subgroup), ...(section && { section }) };
        }),
  };
}

/** The technologies that unlock a pack's recipes, as unlocks. */
export interface Unlocks {
  /** The earliest technology that unlocks the recipe of this name, marked as used; none when no technology does. */
  of(recipe: string): string | undefined;
  /** The technologies used: by the science they need, then by depth in the tree, then by id. */
  list(): RecipeGroup[];
}

export function technologyUnlocks(dump: Dump, locale: Locale): Unlocks {
  const technologies = new Map(
    Object.values(dump.technology ?? {})
      .filter((technology) => technology.hidden !== true)
      .map((technology) => [technology.name, technology]),
  );
  // Science packs from the earliest to the latest, by the order of their items.
  const packs = [...new Set([...technologies.values()].flatMap(sciencePacks))].sort((a, b) =>
    compareKeys([orderOf(itemPrototype(dump, a)), a], [orderOf(itemPrototype(dump, b)), b]),
  );

  // The latest science pack a technology needs: its own, or for one researched by a trigger, its prerequisites'.
  const sections = new Map<string, number>();
  const depths = new Map<string, number>();
  const sectionOf = (name: string, seen = new Set<string>()): number => {
    const known = sections.get(name);
    if (known !== undefined) return known;
    const technology = technologies.get(name);
    if (!technology || seen.has(name)) return -1;
    seen.add(name);
    const own = sciencePacks(technology).map((pack) => packs.indexOf(pack));
    const section = Math.max(-1, ...(own.length > 0 ? own : prerequisites(technology).map((p) => sectionOf(p, seen))));
    sections.set(name, section);
    return section;
  };
  const depthOf = (name: string, seen = new Set<string>()): number => {
    const known = depths.get(name);
    if (known !== undefined) return known;
    const technology = technologies.get(name);
    if (!technology || seen.has(name)) return 0;
    seen.add(name);
    const before = prerequisites(technology);
    const depth = before.length === 0 ? 0 : 1 + Math.max(...before.map((p) => depthOf(p, seen)));
    depths.set(name, depth);
    return depth;
  };
  const key = (name: string): [number, number, string] => [sectionOf(name), depthOf(name), name];

  const unlockedBy = new Map<string, string>();
  for (const technology of technologies.values()) {
    for (const effect of (Array.isArray(technology.effects) ? technology.effects : []) as Record<string, unknown>[]) {
      if (effect.type !== "unlock-recipe" || typeof effect.recipe !== "string") continue;
      const earlier = unlockedBy.get(effect.recipe);
      if (!earlier || compareKeys(key(technology.name), key(earlier)) < 0) {
        unlockedBy.set(effect.recipe, technology.name);
      }
    }
  }

  const used = new Set<string>();
  return {
    of(recipe) {
      const technology = unlockedBy.get(recipe);
      if (technology) used.add(technology);
      return technology;
    },
    list: () =>
      [...used]
        .sort((a, b) => compareKeys(key(a), key(b)))
        .map((name) => {
          const pack = packs[sectionOf(name)];
          const section = pack && itemName(dump, locale, pack);
          return {
            id: name,
            name: technologyName(technologies.get(name) as Prototype, locale),
            ...(section && { section }),
          };
        }),
  };
}

/** "automation-2" reads "Automation 2": the game names a technology's later levels after its first. */
function technologyName(technology: Prototype, locale: Locale): string {
  const named = localise(technology.localised_name, locale) ?? locale.get(`technology-name.${technology.name}`);
  if (named) return named;
  const level = /^(.+)-(\d+)$/.exec(technology.name);
  const first = level && locale.get(`technology-name.${level[1] as string}`);
  return first ? `${first} ${level[2] as string}` : humanise(technology.name);
}

/** The science packs a technology's research costs; none for technologies researched by a trigger. */
function sciencePacks(technology: Prototype): string[] {
  const unit = technology.unit as { ingredients?: unknown } | undefined;
  if (!Array.isArray(unit?.ingredients)) return [];
  return (unit.ingredients as unknown[]).flatMap((ingredient) => {
    // [name, amount] in 2.x dumps, { name, amount } in older ones.
    const name = Array.isArray(ingredient) ? ingredient[0] : (ingredient as { name?: unknown } | null)?.name;
    return typeof name === "string" ? [name] : [];
  });
}

function prerequisites(technology: Prototype): string[] {
  const value = technology.prerequisites;
  return Array.isArray(value) ? value.filter((name): name is string => typeof name === "string") : [];
}

function itemPrototype(dump: Dump, name: string): Prototype | undefined {
  return dump.item?.[name] ?? dump.tool?.[name];
}

function itemName(dump: Dump, locale: Locale, name: string): string {
  const prototype = itemPrototype(dump, name);
  return (prototype && localise(prototype.localised_name, locale)) ?? locale.get(`item-name.${name}`) ?? humanise(name);
}

function orderOf(prototype: Prototype | undefined): string {
  return typeof prototype?.order === "string" ? prototype.order : LAST;
}

function compareKeys(a: (string | number)[], b: (string | number)[]): number {
  for (let index = 0; index < a.length; index++) {
    const [x, y] = [a[index], b[index]];
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}
