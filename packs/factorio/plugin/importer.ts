// Turns the game's `factorio --dump-data` output (script-output/data-raw-dump.json: every prototype, as the game
// loaded it) and its English locale files into pack data. Hides the dump format: prototype types, energy written as
// strings ("75kW"), recipe categories (one in 2.0, several in 2.1), probabilistic results, defaults the dump leaves
// out, and that names live in separate locale files. Quality levels become item variants (`iron-plate@rare`), and
// what the mechanics plugin needs becomes building fields and recipe tags. Maintainer tooling
// (`pnpm pack:import factorio`); the app never runs it.
import type { Building, Item, Logistics, PackDataFile, Recipe, Resource } from "../../../src/contracts/pack";
import { localise, parseLocale } from "./locale";

/** The dump, then the English locale of every built-in mod (data/<mod>/locale/en/<mod>.cfg). The locale is optional. */
export const ACCEPTS = [
  "data-raw-dump.json",
  "core.cfg",
  "base.cfg",
  "elevated-rails.cfg",
  "quality.cfg",
  "recycler.cfg",
  "space-age.cfg",
];

/** Prototype types of buildings that run recipes. */
const CRAFTING_MACHINES = ["assembling-machine", "furnace", "rocket-silo"];
/** Prototype types of buildings that extract resources, in the order the pack lists them. */
const EXTRACTORS = ["mining-drill", "offshore-pump", "agricultural-tower", "asteroid-collector"];

/** A belt moves `speed` tiles per tick; a tile holds 4 items on each of its 2 lanes. */
const BELT_ITEMS_PER_TILE = 8;
const TICKS_PER_SECOND = 60;
/** Belts as players call them. Colours aren't in the data. */
const BELT_ALIASES: Record<string, string[]> = {
  "transport-belt": ["yellow belt", "basic belt"],
  "fast-transport-belt": ["red belt", "fast belt"],
  "express-transport-belt": ["blue belt", "express belt"],
  "turbo-transport-belt": ["green belt", "turbo belt"],
};
/**
 * Units per second through a pipe. Since 2.0, fluid moves through a whole pipe segment at once; the most one fluid
 * connection passes is 6000/s (five pumps' worth). It isn't in the data.
 */
const PIPE_CAPACITY = 6000;

/** Crafting machines draw 1/30 of their power even when idle, unless their prototype says otherwise. */
const DEFAULT_DRAIN = 1 / 30;
/** A building that doesn't list its allowed effects takes modules of every effect. */
const ALL_EFFECTS = ["consumption", "speed", "productivity", "pollution", "quality"];
const DEFAULT_CRAFT_SECONDS = 0.5;

type Prototype = Record<string, unknown> & { name: string };
type Dump = Record<string, Record<string, Prototype> | undefined>;
interface Amount {
  type?: string;
  name: string;
  amount?: number;
  amount_min?: number;
  amount_max?: number;
  probability?: number;
  independent_probability?: number;
  shared_probability?: { min: number; max: number };
  extra_count_fraction?: number;
}

export function importDump(files: Record<string, Uint8Array>): {
  data: PackDataFile;
  icons: Record<string, Uint8Array>;
} {
  const dumpBytes = files["data-raw-dump.json"];
  if (!dumpBytes) throw new Error("Expected data-raw-dump.json");
  const dump = JSON.parse(new TextDecoder().decode(dumpBytes)) as Dump;
  const locale = parseLocale(
    ACCEPTS.slice(1).flatMap((name) => {
      const bytes = files[name];
      return bytes ? [new TextDecoder().decode(bytes)] : [];
    }),
  );
  const prototypes = (type: string) => Object.values(dump[type] ?? {}).filter((entry) => entry.hidden !== true);

  const icons: Record<string, Uint8Array> = {};
  const iconFor = (id: string, prototype: Prototype): { icon?: string } => {
    // Icon sets are named by prototype (FactorioLab) or are the game's own files (graphics/icons/<file>.png).
    const file = typeof prototype.icon === "string" ? /([^/]+)\.png$/.exec(prototype.icon)?.[1] : undefined;
    for (const name of [prototype.name, file]) {
      const bytes = name && files[`icons/${name}.webp`];
      if (bytes) {
        icons[`icons/${id}.webp`] = bytes;
        return { icon: `icons/${id}.webp` };
      }
    }
    return {};
  };

  // Items are every prototype with a stack size (items, capsules, modules, tools …); fluids are their own type.
  // Left out: blueprint parameters and tools spawned from the shortcut bar (blueprints, planners).
  const items = new Map<string, Prototype>();
  for (const group of Object.values(dump)) {
    for (const entry of Object.values(group ?? {})) {
      const spawnable = list(entry.flags).includes("spawnable");
      if (typeof entry.stack_size === "number" && entry.parameter !== true && !spawnable) {
        items.set(entry.name, entry);
      }
    }
  }
  const fluids = new Map(
    Object.values(dump.fluid ?? {})
      .filter((entry) => entry.parameter !== true && entry.hidden !== true)
      .map((entry) => [entry.name, entry]),
  );
  const product = (name: string) => items.get(name) ?? fluids.get(name);
  const itemOrder = new Map([...items.values()].map((item) => [String(item.place_result ?? ""), String(item.order)]));

  const named = (prototype: Prototype, ...keys: string[]) =>
    localise(prototype.localised_name, locale) ??
    keys.map((key) => locale.get(key)).find((text) => text !== undefined) ??
    humanise(prototype.name);
  const itemName = (prototype: Prototype) =>
    fluids.get(prototype.name) === prototype
      ? named(prototype, `fluid-name.${prototype.name}`)
      : named(
          prototype,
          `item-name.${prototype.name}`,
          `entity-name.${String(prototype.place_result ?? prototype.name)}`,
          `equipment-name.${String(prototype.place_as_equipment_result ?? prototype.name)}`,
        );

  // Base game buildings first, then slower before faster (the first building is a recipe's default).
  const buildingOrder = (a: Prototype, b: Prototype) =>
    Number(modOf(a) !== "base") - Number(modOf(b) !== "base") ||
    speedOf(a) - speedOf(b) ||
    (itemOrder.get(a.name) ?? "").localeCompare(itemOrder.get(b.name) ?? "") ||
    a.name.localeCompare(b.name);
  const machines = CRAFTING_MACHINES.flatMap(prototypes).sort(buildingOrder);
  const extractors = EXTRACTORS.flatMap((type) => prototypes(type).sort(buildingOrder));
  const building = (entity: Prototype, crafting: boolean): Building => {
    const power = powerMW(entity, crafting);
    const extra = fields(entity, crafting);
    return {
      id: entity.name,
      name: named(entity, `entity-name.${entity.name}`),
      ...iconFor(entity.name, entity),
      speed: speedOf(entity),
      ...(power !== undefined && { power: { consume: power } }),
      ...(extra && { fields: extra }),
    };
  };

  const recipes = Object.values(dump.recipe ?? {}).flatMap((entry): Recipe[] => {
    if (entry.parameter === true) return [];
    const categories = recipeCategories(entry);
    // Recyclers run recycling recipes, which the game hides from the crafting menu. Hidden items (the editor's
    // infinity chest …) stay out, but the hidden rocket part, which a visible recipe makes, stays in.
    const recyclesVisibleItem =
      categories.includes("recycling") &&
      (Array.isArray(entry.ingredients) ? (entry.ingredients as Amount[]) : []).every(
        (ingredient) => product(ingredient.name)?.hidden !== true,
      );
    if (entry.hidden === true && !recyclesVisibleItem) return [];
    const makers = machines.filter((machine) =>
      list(machine.crafting_categories).some((category) => categories.includes(category)),
    );
    const inputs = amounts(entry.ingredients, (ingredient) => ingredient.amount ?? 0);
    const outputs = amounts(entry.results, expectedAmount);
    if (makers.length === 0 || !inputs || !outputs || Object.keys(outputs).length === 0) return [];

    const main = typeof entry.main_product === "string" ? entry.main_product : undefined;
    const results = Object.keys(outputs);
    const mainProduct = product(main ?? (results.length === 1 ? (results[0] as string) : ""));
    const name =
      localise(entry.localised_name, locale) ??
      locale.get(`recipe-name.${entry.name}`) ??
      (mainProduct ? itemName(mainProduct) : humanise(entry.name));

    // The expansion mods a recipe needs: its icon's, its items', and its machines' when no base machine makes it.
    const mods = new Set(iconPaths(entry).map(modOfPath));
    for (const id of [...Object.keys(inputs), ...results]) mods.add(modOf(product(id) as Prototype));
    const makerMods = makers.map(modOf);
    if (!makerMods.includes("base")) for (const mod of makerMods) mods.add(mod);
    mods.delete("base");
    const tags = [
      ...[...mods].sort(),
      ...(categories.includes("recycling") ? ["recycling"] : []),
      ...(entry.allow_productivity === true ? ["productivity", ...ignoredByProductivity(entry)] : []),
      ...(entry.allow_quality === false ? ["no-quality"] : []),
    ];
    return [
      {
        id: entry.name,
        name,
        buildings: makers.map((machine) => machine.name),
        time: number(entry.energy_required) ?? DEFAULT_CRAFT_SECONDS,
        in: inputs,
        out: outputs,
        ...(tags.length > 0 && { tags }),
      },
    ];
  });
  /** Amounts by item, or undefined when the recipe deals with an item the pack leaves out. */
  function amounts(value: unknown, amount: (entry: Amount) => number): Record<string, number> | undefined {
    const result: Record<string, number> = {};
    for (const entry of (Array.isArray(value) ? value : []) as Amount[]) {
      if (!product(entry.name)) return undefined;
      const total = clean((result[entry.name] ?? 0) + amount(entry));
      if (total > 0) result[entry.name] = total;
    }
    return result;
  }

  // Resources: what drills mine from resource patches, offshore pumps pump from tiles, agricultural towers harvest
  // from plants and asteroid collectors catch in space.
  const sources = new Map<string, Set<string>>();
  const extracted = (names: string[], by: Prototype[]) => {
    for (const name of names) {
      if (!product(name)) continue;
      const set = sources.get(name) ?? new Set<string>();
      for (const extractor of by) set.add(extractor.name);
      sources.set(name, set);
    }
  };
  for (const patch of prototypes("resource")) {
    const category = typeof patch.category === "string" ? patch.category : "basic-solid";
    const drills = extractors.filter(
      (extractor) => extractor.type === "mining-drill" && list(extractor.resource_categories).includes(category),
    );
    extracted(minedNames(patch), drills);
  }
  const ofType = (type: string) => extractors.filter((extractor) => extractor.type === type);
  extracted(
    Object.values(dump.tile ?? {}).flatMap((tile) => (typeof tile.fluid === "string" ? [tile.fluid] : [])),
    ofType("offshore-pump"),
  );
  extracted(prototypes("plant").flatMap(minedNames), ofType("agricultural-tower"));
  extracted(prototypes("asteroid-chunk").flatMap(minedNames), ofType("asteroid-collector"));
  const resources: Resource[] = [...sources]
    .filter(([, by]) => by.size > 0)
    .map(([item, by]) => ({ item, extractors: [...by] }))
    .sort((a, b) => a.item.localeCompare(b.item));

  const used = new Set([
    ...recipes.flatMap((recipe) => [...Object.keys(recipe.in), ...Object.keys(recipe.out)]),
    ...resources.map((resource) => resource.item),
  ]);
  // Every solid item comes in each quality above normal, as a variant (`iron-plate@rare`) right after it.
  const qualities = prototypes("quality")
    .filter((quality) => (number(quality.level) ?? 0) > 0)
    .sort((a, b) => (number(a.level) ?? 0) - (number(b.level) ?? 0));
  const itemList: Item[] = [...used]
    .sort()
    .map((id) => product(id) as Prototype)
    .flatMap((prototype): Item[] => {
      const item: Item = {
        id: prototype.name,
        name: itemName(prototype),
        form: fluids.get(prototype.name) === prototype ? "fluid" : "solid",
        ...iconFor(prototype.name, prototype),
      };
      if (item.form === "fluid") return [item];
      return [
        item,
        ...qualities.map((quality) => ({
          ...item,
          id: `${item.id}@${quality.name}`,
          name: `${item.name} (${named(quality, `quality-name.${quality.name}`)})`,
        })),
      ];
    });

  const logistics: Logistics[] = [
    ...prototypes("transport-belt")
      .sort((a, b) => Number(a.speed) - Number(b.speed))
      .map((belt) => {
        const aliases = BELT_ALIASES[belt.name];
        return {
          id: belt.name,
          name: named(belt, `entity-name.${belt.name}`),
          ...(aliases && { aliases }),
          carries: "solid" as const,
          capacity: clean(Number(belt.speed) * BELT_ITEMS_PER_TILE * TICKS_PER_SECOND),
        };
      }),
    ...prototypes("pipe").map((pipe) => ({
      id: pipe.name,
      name: named(pipe, `entity-name.${pipe.name}`),
      aliases: ["fluid pipe"],
      carries: "fluid" as const,
      capacity: PIPE_CAPACITY,
    })),
  ];

  return {
    data: {
      units: { rate: "per_second" },
      items: itemList,
      buildings: [
        ...machines.map((machine) => building(machine, true)),
        ...extractors.map((extractor) => building(extractor, false)),
      ],
      recipes: recipes.sort((a, b) => a.id.localeCompare(b.id)),
      logistics,
      resources,
    },
    icons,
  };
}

/** What one result yields per craft on average: chance × (amount + the chance of one more). */
function expectedAmount(result: Amount): number {
  const amount = result.amount ?? ((result.amount_min ?? 0) + (result.amount_max ?? 0)) / 2;
  return chanceOf(result) * (amount + (result.extra_count_fraction ?? 0));
}

function chanceOf(result: Amount): number {
  const shared = result.shared_probability;
  return result.probability ?? result.independent_probability ?? (shared ? shared.max - shared.min : 1);
}

/**
 * Tags with the part of each result that productivity doesn't multiply (`ignored_by_productivity`, catalysts such
 * as Kovarex's 40 U-235), per craft on average: `ignored-by-productivity:uranium-235=40`.
 */
function ignoredByProductivity(recipe: Prototype): string[] {
  const ignored = new Map<string, number>();
  for (const result of (Array.isArray(recipe.results) ? recipe.results : []) as (Amount & {
    ignored_by_productivity?: number;
  })[]) {
    const amount = Math.min(result.ignored_by_productivity ?? 0, result.amount ?? result.amount_max ?? 0);
    if (amount > 0) ignored.set(result.name, (ignored.get(result.name) ?? 0) + chanceOf(result) * amount);
  }
  return [...ignored].map(([item, amount]) => `ignored-by-productivity:${item}=${clean(amount)}`);
}

/** Factorio 2.1 gives recipes several categories, 2.0 one; without any, a recipe is "crafting". */
function recipeCategories(recipe: Prototype): string[] {
  if (Array.isArray(recipe.categories)) return list(recipe.categories);
  return [typeof recipe.category === "string" ? recipe.category : "crafting"];
}

/** What the mechanics plugin reads: module slots and effects, built-in effects, drain, fuel and the expansion. */
function fields(entity: Prototype, crafting: boolean): Building["fields"] {
  const result: NonNullable<Building["fields"]> = {};
  const slots = number(entity.module_slots) ?? 0;
  const effects = entity.allowed_effects === undefined ? ALL_EFFECTS : list(entity.allowed_effects);
  if (slots > 0) result.modules = { slots, effects: effects.join(",") };
  const receiver = entity.effect_receiver as { base_effect?: Record<string, number> } | undefined;
  if (receiver?.base_effect && Object.keys(receiver.base_effect).length > 0) {
    result["base-effect"] = receiver.base_effect;
  }
  const source = entity.energy_source as { type?: string; fuel_categories?: string[] } | undefined;
  if (source?.type && source.type !== "electric") {
    const fuel = list(source.fuel_categories);
    result.energy = { source: source.type, ...(fuel.length > 0 && { fuel: fuel.join(",") }) };
  }
  const drain = drainWatts(entity, crafting);
  if (drain > 0) result.energy = { drain: clean(drain / 1e6) };
  const mod = modOf(entity);
  if (mod !== "base") result.mod = { name: mod };
  return Object.keys(result).length > 0 ? result : undefined;
}

/** What the building draws at full speed, in MW: its energy usage plus its electric drain. */
function powerMW(entity: Prototype, crafting: boolean): number | undefined {
  const usage = watts(entity.energy_usage);
  if (usage === undefined) return undefined;
  return clean((usage + drainWatts(entity, crafting)) / 1e6);
}

/** What an electric building draws even when idle, in W. */
function drainWatts(entity: Prototype, crafting: boolean): number {
  const usage = watts(entity.energy_usage) ?? 0;
  const source = entity.energy_source as { type?: string; drain?: string } | undefined;
  return source?.type === "electric" ? (watts(source.drain) ?? (crafting ? usage * DEFAULT_DRAIN : 0)) : 0;
}

function speedOf(entity: Prototype): number {
  return number(entity.crafting_speed) ?? number(entity.mining_speed) ?? 1;
}

/** What mining or harvesting the prototype yields: `result` or the names in `results`. */
function minedNames(prototype: Prototype): string[] {
  const minable = prototype.minable as { result?: string; results?: Amount[] } | undefined;
  if (!minable) return [];
  return minable.results ? minable.results.map((result) => result.name) : minable.result ? [minable.result] : [];
}

/** "__space-age__/graphics/…" → "space-age"; the engine's own `__core__` counts as the base game. */
function modOfPath(path: string): string {
  const mod = /^__([\w-]+)__\//.exec(path)?.[1] ?? "base";
  return mod === "core" ? "base" : mod;
}

/** The mod a prototype comes from, judged by its icon: the dump doesn't say. */
function modOf(prototype: Prototype): string {
  const [first] = iconPaths(prototype);
  return first ? modOfPath(first) : "base";
}

function iconPaths(prototype: Prototype): string[] {
  if (typeof prototype.icon === "string") return [prototype.icon];
  return (Array.isArray(prototype.icons) ? (prototype.icons as { icon?: unknown }[]) : []).flatMap((layer) =>
    typeof layer.icon === "string" ? [layer.icon] : [],
  );
}

/** "75kW" → 75000. Energy per tick or per second alike: the dump writes power with W. */
function watts(value: unknown): number | undefined {
  const match = typeof value === "string" ? /^([\d.]+(?:e[+-]?\d+)?)\s*([kMGTP]?)W$/.exec(value) : null;
  if (!match) return undefined;
  const prefixes: Record<string, number> = { "": 1, k: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15 };
  return Number(match[1]) * (prefixes[match[2] as string] ?? 1);
}

/** The dump writes empty lists as `{}`. */
function list(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function number(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** Drops floating-point noise: 0.007000000000000001 → 0.007. */
function clean(value: number): number {
  return Number(value.toPrecision(12));
}

/** "assembling-machine-1" → "Assembling machine 1", the way the game's English names read. */
function humanise(name: string): string {
  const words = name.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
