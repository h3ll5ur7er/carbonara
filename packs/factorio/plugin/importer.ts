// Turns the game's `factorio --dump-data` output (script-output/data-raw-dump.json: every prototype, as the game
// loaded it) and its English locale files into pack data. Hides the dump format: prototype types, energy written as
// strings ("75kW"), recipe categories (one in 2.0, several in 2.1), probabilistic results, defaults the dump leaves
// out, and that names live in separate locale files. Quality levels become item variants (`iron-plate@rare`), and
// what the mechanics plugin needs becomes building fields and recipe tags. The crafting menu's rows and the
// technologies that unlock recipes become the recipe browser's categories and unlocks (groups.ts). Power generation becomes recipes of the
// buildings that make steam, heat, plasma and electricity, with fluids that generators burn for their heat split by
// temperature (`steam@500`). Maintainer tooling (`pnpm pack:import factorio`); the app never runs it.
import type { Building, Item, Logistics, PackDataFile, Recipe, Resource } from "../../../src/contracts/pack";
import { atTemperature, ELECTRICITY, HEAT, temperatureOf } from "./energy";
import { menuCategories, technologyUnlocks } from "./groups";
import { humanise, localise, parseLocale } from "./locale";

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
/** Prototype types of buildings that make steam, heat, plasma or electricity, in the order the pack lists them. */
const GENERATORS = ["boiler", "reactor", "fusion-reactor", "generator", "fusion-generator"];
/** Power recipes run for a second: their amounts are rates of one building, and electricity and heat are in MW. */
const POWER_SECONDS = 1;
/**
 * The most neighbours a reactor can have: a nuclear reactor shares its sides with four, a fusion reactor's eight
 * fluid connections can each reach another (its plasma then stays below the fluid's 10,000,000 °C maximum).
 */
const MAX_NEIGHBOURS: Record<string, number> = { reactor: 4, "fusion-reactor": 8 };
/** What a burner takes first: the fuel players start with. Other fuels follow by name. */
const DEFAULT_FUEL = "coal";
/** FluidPrototype's defaults: 1 kJ per unit and °C, from 15 °C. */
const DEFAULT_HEAT_CAPACITY = 1000;
const DEFAULT_TEMPERATURE = 15;

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
/** RecipePrototype's default `maximum_productivity`: +300 %. */
const DEFAULT_MAXIMUM_PRODUCTIVITY = 3;

type Prototype = Record<string, unknown> & { name: string };
type Dump = Record<string, Record<string, Prototype> | undefined>;
interface Amount {
  type?: string;
  name: string;
  temperature?: number;
  minimum_temperature?: number;
  maximum_temperature?: number;
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
  /** The prototype of an item, fluid or fluid variant (`steam@500` is steam). */
  const product = (name: string) => {
    const base = temperatureOf(name)?.fluid ?? name;
    return items.get(base) ?? fluids.get(base);
  };

  // Fluids that generators burn for their heat (steam, plasma) are told apart by temperature: each temperature
  // something makes them at is a variant. Boilers make steam at their target temperature, recipes at their
  // result's, fusion reactors plasma at its default temperature, hotter with each neighbour.
  const temperatures = new Map<string, Set<number>>();
  for (const generator of prototypes("generator")) burnsHeatOf(fluidBox(generator.fluid_box).filter);
  for (const generator of prototypes("fusion-generator")) burnsHeatOf(fluidBox(generator.input_fluid_box).filter);
  function burnsHeatOf(fluid: string | undefined) {
    if (fluid && fluids.has(fluid)) temperatures.set(fluid, new Set());
  }
  const temperatureOfFluid = (name: string) => number(fluids.get(name)?.default_temperature) ?? DEFAULT_TEMPERATURE;
  /** The fluid's id at a temperature (its default when none is given), noting the variant; other ids as they are. */
  const fluidAt = (name: string, temperature?: number) => {
    const made = temperatures.get(name);
    if (!made) return name;
    const at = temperature ?? temperatureOfFluid(name);
    made.add(at);
    return atTemperature(name, at);
  };
  const heatCapacity = (fluid: Prototype) => energy(fluid.heat_capacity, "J") ?? DEFAULT_HEAT_CAPACITY;
  const variantsOf = (fluid: string) => [...(temperatures.get(fluid) ?? [])].sort((a, b) => a - b);
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
    const consume = powerMW(entity, crafting);
    const produce = producedMW(entity);
    const extra = { ...fields(entity, crafting), ...burnerFields(entity) };
    const usage = burnerOf(entity) ? burnerWatts(entity) : undefined;
    if (usage !== undefined) extra.energy = { ...extra.energy, usage: clean(usage / 1e6) };
    return {
      id: entity.name,
      name: named(entity, `entity-name.${entity.name}`),
      ...iconFor(entity.name, entity),
      speed: speedOf(entity),
      ...((consume !== undefined || produce !== undefined) && {
        power: { ...(consume !== undefined && { consume }), ...(produce !== undefined && { produce }) },
      }),
      ...(Object.keys(extra).length > 0 && { fields: extra }),
    };
  };
  /** The fuels a burner takes, its default first, then by name; hidden ones (the editor's) left out. */
  function fuelsOf(entity: Prototype): Prototype[] {
    const categories = list(burnerOf(entity)?.fuel_categories);
    if (categories.length === 0) return [];
    return [...items.values()]
      .filter((item) => item.hidden !== true && energy(item.fuel_value, "J") !== undefined)
      .filter((item) => categories.includes(String(item.fuel_category)))
      .sort(
        (a, b) => Number(b.name === DEFAULT_FUEL) - Number(a.name === DEFAULT_FUEL) || a.name.localeCompare(b.name),
      );
  }
  /** What the mechanics need of a burner (fuels in MJ, what they burn into) and of a reactor or fusion generator. */
  function burnerFields(entity: Prototype): NonNullable<Building["fields"]> {
    const result: NonNullable<Building["fields"]> = {};
    const fuels = fuelsOf(entity);
    if (fuels.length > 0) {
      result.fuels = Object.fromEntries(
        fuels.map((fuel) => [fuel.name, clean((energy(fuel.fuel_value, "J") ?? 0) / 1e6)]),
      );
      const burnt = fuels.flatMap((fuel) =>
        typeof fuel.burnt_result === "string" ? [[fuel.name, fuel.burnt_result]] : [],
      );
      if (burnt.length > 0) result.burnt = Object.fromEntries(burnt);
    }
    const bonus = neighbourBonus(entity);
    if (bonus > 0) {
      const boosts = entity.type === "fusion-reactor" ? "temperature" : "heat";
      result.reactor = { "neighbour-bonus": bonus, neighbours: maxNeighbours(entity), boosts };
    }
    if (entity.type === "fusion-generator") {
      const fluid = fluidBox(entity.input_fluid_box).filter;
      if (fluid) result.generator = { fluid };
    }
    return result;
  }
  /** What the building burns at full speed, in W: crafting machines' energy usage, boilers' and reactors' energy. */
  function burnerWatts(entity: Prototype): number | undefined {
    if (entity.type === "fusion-reactor") {
      // Its plasma's heat above 0 °C (100 MW): fusion power cells last 400 s.
      const plasma = fluids.get(fluidBox(entity.output_fluid_box).filter ?? "");
      const perSecond = (number(entity.max_fluid_usage) ?? 0) * TICKS_PER_SECOND;
      return plasma && perSecond * heatCapacity(plasma) * temperatureOfFluid(plasma.name);
    }
    return energy(entity.energy_usage ?? entity.energy_consumption ?? entity.consumption, "W");
  }
  /** What a generator makes at most, in MW. */
  function producedMW(entity: Prototype): number | undefined {
    if (entity.type === "fusion-generator") {
      const megawatts = fusionGeneratorMW(entity, fluids.get(fluidBox(entity.input_fluid_box).filter ?? ""));
      return megawatts === undefined ? undefined : clean(megawatts);
    }
    if (entity.type !== "generator") return undefined;
    const fluid = fluids.get(fluidBox(entity.fluid_box).filter ?? "");
    const hottest = number(entity.maximum_temperature);
    return fluid && hottest !== undefined ? clean(generatorMW(entity, fluid, hottest)) : undefined;
  }

  // Productivity research: technologies that change recipes' productivity, by how much per level.
  const research = new Map<string, [string, number][]>();
  for (const technology of prototypes("technology")) {
    for (const effect of (Array.isArray(technology.effects) ? technology.effects : []) as Record<string, unknown>[]) {
      const change = number(effect.change);
      if (effect.type !== "change-recipe-productivity" || typeof effect.recipe !== "string" || !change) continue;
      research.set(effect.recipe, [...(research.get(effect.recipe) ?? []), [technology.name, change]]);
    }
  }

  /** Each recipe's ingredients as the dump gives them, for their temperature limits. */
  const limits = new Map<string, Amount[]>();
  /** Where each recipe sits in the game: its crafting menu row, and the recipe whose technology unlocks it. */
  const placed = new Map<string, { subgroup?: string | undefined; unlockedAs?: string | undefined }>();
  const crafted = Object.values(dump.recipe ?? {}).flatMap((entry): Recipe[] => {
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
    const outputs = amounts(entry.results, expectedAmount, (result) =>
      result.type === "fluid" ? fluidAt(result.name, result.temperature) : result.name,
    );
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
    const maximum = number(entry.maximum_productivity);
    const tags = [
      ...[...mods].sort(),
      ...(categories.includes("recycling") ? ["recycling"] : []),
      ...(entry.allow_productivity === true ? ["productivity", ...ignoredByProductivity(entry)] : []),
      ...(research.get(entry.name) ?? []).map(([technology, change]) => `research:${technology}=${change}`),
      ...(maximum !== undefined && maximum !== DEFAULT_MAXIMUM_PRODUCTIVITY ? [`maximum-productivity:${maximum}`] : []),
      ...(entry.allow_quality === false ? ["no-quality"] : []),
    ];
    const recipe: Recipe = {
      id: entry.name,
      name,
      buildings: makers.map((machine) => machine.name),
      time: number(entry.energy_required) ?? DEFAULT_CRAFT_SECONDS,
      in: inputs,
      out: outputs,
      ...(tags.length > 0 && { tags }),
    };
    limits.set(recipe.id, Array.isArray(entry.ingredients) ? (entry.ingredients as Amount[]) : []);
    placed.set(recipe.id, {
      // Recycling sits with what it takes apart, as the game shows it.
      subgroup:
        text(entry.subgroup) ??
        text((categories.includes("recycling") ? product(Object.keys(inputs)[0] ?? "") : mainProduct)?.subgroup),
      // Recipes enabled from the start need no technology.
      unlockedAs: entry.enabled === false ? entry.name : undefined,
    });
    return [recipe];
  });
  /** Amounts by item, or undefined when the recipe deals with an item the pack leaves out. */
  function amounts(
    value: unknown,
    amount: (entry: Amount) => number,
    key: (entry: Amount) => string = (entry) => entry.name,
  ): Record<string, number> | undefined {
    const result: Record<string, number> = {};
    for (const entry of (Array.isArray(value) ? value : []) as Amount[]) {
      if (!product(entry.name)) return undefined;
      const id = key(entry);
      const total = clean((Object.hasOwn(result, id) ? (result[id] as number) : 0) + amount(entry));
      if (total > 0) result[id] = total;
    }
    return result;
  }

  // Buildings that make steam, heat, plasma and electricity, each with one recipe a second long (one per steam
  // temperature for steam engines and turbines).
  const generators = GENERATORS.flatMap((type) => prototypes(type).sort(buildingOrder));
  const powerRecipes = generators.flatMap((entity): Recipe[] => {
    const entityName = named(entity, `entity-name.${entity.name}`);
    // A building's recipe is named after the item that places it; its technology unlocks the power it makes.
    const placer = [...items.values()].find((item) => item.place_result === entity.name);
    const recipe = (id: string, made: string, inputs: Record<string, number>, outputs: Record<string, number>) => {
      placed.set(id, { subgroup: text(placer?.subgroup), unlockedAs: placer?.name ?? entity.name });
      const mod = modOf(entity);
      return {
        id,
        name: `${made} (${entityName})`,
        buildings: [entity.name],
        time: POWER_SECONDS,
        in: cleaned(inputs),
        out: cleaned(outputs),
        tags: [...(mod === "base" ? [] : [mod]), "power", "no-quality"],
      };
    };
    switch (entity.type) {
      case "boiler": {
        // Water in, steam out at the target temperature, conserving heat (2.0): as much water as has the steam's
        // heat capacity.
        const water = fluids.get(fluidBox(entity.fluid_box).filter ?? "");
        const steam = fluids.get(fluidBox(entity.output_fluid_box).filter ?? "");
        const target = number(entity.target_temperature);
        const watts = energy(entity.energy_consumption, "W");
        if (!water || !steam || target === undefined || watts === undefined) return [];
        const made = watts / ((target - temperatureOfFluid(steam.name)) * heatCapacity(steam));
        const heat = sourceOf(entity)?.type === "heat" ? { [HEAT]: watts / 1e6 } : {};
        return [
          recipe(
            `${entity.name}-${steam.name}`,
            itemName(steam),
            { [water.name]: (made * heatCapacity(steam)) / heatCapacity(water), ...heat },
            { [fluidAt(steam.name, target)]: made },
          ),
        ];
      }
      case "reactor": {
        const watts = energy(entity.consumption, "W");
        return watts === undefined ? [] : [recipe(`${entity.name}-heat`, "Heat", {}, { [HEAT]: watts / 1e6 })];
      }
      case "fusion-reactor": {
        // Coolant in, as much plasma out at its default temperature; neighbours make it hotter (the mechanics).
        const coolant = fluidBox(entity.input_fluid_box).filter;
        const plasma = fluids.get(fluidBox(entity.output_fluid_box).filter ?? "");
        const perSecond = (number(entity.max_fluid_usage) ?? 0) * TICKS_PER_SECOND;
        if (!coolant || !plasma || perSecond === 0) return [];
        return [
          recipe(
            `${entity.name}-plasma`,
            itemName(plasma),
            { [coolant]: perSecond },
            { [fluidAt(plasma.name)]: perSecond },
          ),
        ];
      }
      case "generator": {
        // Each steam temperature it takes: its usage, worth the heat above the fluid's default temperature, up to
        // the generator's maximum (hotter steam is used up all the same).
        const box = fluidBox(entity.fluid_box);
        const fluid = fluids.get(box.filter ?? "");
        const perSecond = (number(entity.fluid_usage_per_tick) ?? 0) * TICKS_PER_SECOND;
        if (!fluid || perSecond === 0) return [];
        return variantsOf(fluid.name)
          .filter((temperature) => temperature >= (box.minimum_temperature ?? -Infinity))
          .map((temperature) => {
            const variant = atTemperature(fluid.name, temperature);
            const megawatts = generatorMW(entity, fluid, temperature);
            return recipe(
              `${entity.name}-${ELECTRICITY}@${temperature}`,
              `Electricity`,
              { [variant]: perSecond },
              { [ELECTRICITY]: megawatts },
            );
          })
          .map((made) => ({ ...made, name: `Electricity (${entityName}, ${variantName(made.in)})` }));
      }
      case "fusion-generator": {
        // Plasma at its default temperature (the mechanics take hotter plasma); as much hot coolant back.
        const plasma = fluids.get(fluidBox(entity.input_fluid_box).filter ?? "");
        const coolant = fluidBox(entity.output_fluid_box).filter;
        const perSecond = (number(entity.max_fluid_usage) ?? 0) * TICKS_PER_SECOND;
        const megawatts = fusionGeneratorMW(entity, plasma);
        if (!plasma || !coolant || megawatts === undefined) return [];
        return [
          recipe(
            `${entity.name}-${ELECTRICITY}`,
            "Electricity",
            { [fluidAt(plasma.name)]: perSecond },
            { [ELECTRICITY]: megawatts, [coolant]: perSecond },
          ),
        ];
      }
      default:
        return [];
    }
  });
  /** What a steam engine or turbine makes from steam at a temperature, in MW. */
  function generatorMW(entity: Prototype, fluid: Prototype, temperature: number): number {
    const perSecond = (number(entity.fluid_usage_per_tick) ?? 0) * TICKS_PER_SECOND;
    const used = Math.min(temperature, number(entity.maximum_temperature) ?? temperature);
    const effectivity = number(entity.effectivity) ?? 1;
    return (perSecond * (used - temperatureOfFluid(fluid.name)) * heatCapacity(fluid) * effectivity) / 1e6;
  }
  /** A fusion generator's output: its plasma's heat above 0 °C, at most its output limit, in MW. */
  function fusionGeneratorMW(entity: Prototype, plasma: Prototype | undefined): number | undefined {
    if (!plasma) return undefined;
    const perSecond = (number(entity.max_fluid_usage) ?? 0) * TICKS_PER_SECOND;
    const heat = perSecond * heatCapacity(plasma) * temperatureOfFluid(plasma.name);
    const limit = energy((entity.energy_source as Prototype | undefined)?.output_flow_limit, "W") ?? Infinity;
    return Math.min(heat, limit) / 1e6;
  }
  /** "Steam 165 °C", for the one variant among the amounts. */
  function variantName(amounts: Record<string, number>): string {
    const variant = Object.keys(amounts)
      .map(temperatureOf)
      .find((found) => found !== undefined);
    if (!variant) return "";
    const fluid = fluids.get(variant.fluid);
    return `${fluid ? itemName(fluid) : variant.fluid} ${variant.temperature.toLocaleString("en")} °C`;
  }
  /** Plasma: each temperature a fusion reactor makes it at, with 0 to its most neighbours. */
  for (const entity of prototypes("fusion-reactor")) {
    const plasma = fluidBox(entity.output_fluid_box).filter;
    const bonus = neighbourBonus(entity);
    if (!plasma || !temperatures.has(plasma)) continue;
    for (let neighbours = 0; neighbours <= maxNeighbours(entity); neighbours++) {
      fluidAt(plasma, temperatureOfFluid(plasma) * (1 + bonus * neighbours));
    }
  }

  // Recipes that take such a fluid without a temperature limit come once per temperature: `steam-condensation@500`.
  const recipes = [
    ...crafted.flatMap((recipe): Recipe[] => {
      const heated = Object.keys(recipe.in).find((item) => temperatures.has(item));
      if (heated === undefined) return [recipe];
      const ingredient = limits.get(recipe.id)?.find((entry) => entry.name === heated);
      const { [heated]: amount, ...others } = recipe.in;
      return variantsOf(heated)
        .filter(
          (temperature) =>
            temperature >= (ingredient?.minimum_temperature ?? -Infinity) &&
            temperature <= (ingredient?.maximum_temperature ?? Infinity),
        )
        .map((temperature) => {
          const variant = atTemperature(heated, temperature);
          const inputs = { ...others, [variant]: amount as number };
          return {
            ...recipe,
            id: atTemperature(recipe.id, temperature),
            name: `${recipe.name ?? recipe.id} (${variantName(inputs)})`,
            in: inputs,
          };
        });
    }),
    ...powerRecipes,
  ];
  const known = new Set<string>();
  for (const recipe of recipes) {
    if (known.has(recipe.id)) throw new Error(`Two recipes are called ${recipe.id}`);
    known.add(recipe.id);
  }

  // The recipe browser's groups, listing only what the pack's recipes use. A recipe per steam temperature
  // (`coal-liquefaction@165`) sits where its recipe does.
  const rows = menuCategories(dump, locale);
  const technologies = technologyUnlocks(dump, locale);
  for (const recipe of recipes) {
    const where = placed.get(recipe.id) ?? placed.get(temperatureOf(recipe.id)?.fluid ?? recipe.id);
    if (where?.subgroup !== undefined) recipe.category = rows.use(where.subgroup);
    const unlock = where?.unlockedAs === undefined ? undefined : technologies.of(where.unlockedAs);
    if (unlock !== undefined) recipe.unlock = unlock;
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
    // Every temperature of a fluid generators burn: plasma from reactors with neighbours is made by no recipe.
    ...[...temperatures.keys()].flatMap((fluid) => variantsOf(fluid).map((at) => atTemperature(fluid, at))),
    // The fuels burner buildings take, and what they burn into.
    ...[...machines, ...extractors, ...generators]
      .flatMap((entity) => {
        const fuels = fuelsOf(entity);
        return [
          ...fuels,
          ...fuels.flatMap((fuel) => (typeof fuel.burnt_result === "string" ? [fuel.burnt_result] : [])),
        ];
      })
      .map((fuel) => (typeof fuel === "string" ? fuel : fuel.name)),
  ]);
  // Every solid item comes in each quality above normal, as a variant (`iron-plate@rare`) right after it.
  const qualities = prototypes("quality")
    .filter((quality) => (number(quality.level) ?? 0) > 0)
    .sort((a, b) => (number(a.level) ?? 0) - (number(b.level) ?? 0));
  // Electricity and heat aren't prototypes; they flow from generators as items of their own.
  const flows: Record<string, string> = { [ELECTRICITY]: "Electricity", [HEAT]: "Heat" };
  const itemList: Item[] = [...used].sort().flatMap((id): Item[] => {
    const flow = flows[id];
    if (flow !== undefined && !product(id)) return [{ id, name: flow, form: "fluid" }];
    const prototype = product(id) as Prototype;
    const variant = temperatureOf(id);
    if (variant && temperatures.has(variant.fluid)) {
      const name = `${itemName(prototype)} (${variant.temperature.toLocaleString("en")} °C)`;
      return [{ id, name, form: "fluid", ...iconFor(variant.fluid, prototype) }];
    }
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
        ...generators.map((generator) => building(generator, false)),
      ],
      recipes: recipes.sort((a, b) => a.id.localeCompare(b.id)),
      logistics,
      resources,
      categories: rows.list(),
      unlocks: technologies.list(),
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
  const drain = drainWatts(entity, crafting);
  if (drain > 0) result.energy = { drain: clean(drain / 1e6) };
  const burner = burnerOf(entity);
  const source = sourceOf(entity);
  if (burner) {
    const fuel = list(burner.fuel_categories);
    const effectivity = number(burner.effectivity) ?? 1;
    result.energy = {
      ...result.energy,
      source: "burner",
      ...(fuel.length > 0 && { fuel: fuel.join(",") }),
      ...(effectivity !== 1 && { effectivity }),
    };
  } else if (source?.type && source.type !== "electric") result.energy = { source: source.type };
  const mod = modOf(entity);
  if (mod !== "base") result.mod = { name: mod };
  return Object.keys(result).length > 0 ? result : undefined;
}

/** What an electric building draws at full speed, in MW: its energy usage plus its drain. Burners draw none. */
function powerMW(entity: Prototype, crafting: boolean): number | undefined {
  if (sourceOf(entity)?.type !== "electric") return undefined;
  const drain = drainWatts(entity, crafting);
  const usage = energy(entity.energy_usage, "W");
  if (usage === undefined && drain === 0) return undefined;
  return clean(((usage ?? 0) + drain) / 1e6);
}

/** What an electric building draws even when idle, in W: a fusion reactor's power input is all drain. */
function drainWatts(entity: Prototype, crafting: boolean): number {
  const usage = energy(entity.energy_usage, "W") ?? 0;
  const source = sourceOf(entity);
  if (source?.type !== "electric") return 0;
  return energy(source.drain, "W") ?? energy(entity.power_input, "W") ?? (crafting ? usage * DEFAULT_DRAIN : 0);
}

function sourceOf(entity: Prototype): (Record<string, unknown> & { type?: string }) | undefined {
  return entity.energy_source as (Record<string, unknown> & { type?: string }) | undefined;
}

/** The burner a building burns fuel in: its energy source, or a burner of its own beside it (fusion reactors). */
function burnerOf(entity: Prototype): Record<string, unknown> | undefined {
  const burner = entity.burner as Record<string, unknown> | undefined;
  if (burner?.type === "burner") return burner;
  const source = sourceOf(entity);
  return source?.type === "burner" ? source : undefined;
}

/** A reactor's bonus per neighbour: 100 % unless the prototype says otherwise (the heating tower's 0). */
function neighbourBonus(entity: Prototype): number {
  if (entity.type !== "reactor" && entity.type !== "fusion-reactor") return 0;
  return number(entity.neighbour_bonus) ?? 1;
}

function maxNeighbours(entity: Prototype): number {
  return MAX_NEIGHBOURS[entity.type as string] ?? 0;
}

function fluidBox(value: unknown): Amount & { filter?: string } {
  const box = (value ?? {}) as { filter?: unknown; minimum_temperature?: unknown; maximum_temperature?: unknown };
  return {
    name: "",
    ...(typeof box.filter === "string" && { filter: box.filter }),
    ...(typeof box.minimum_temperature === "number" && { minimum_temperature: box.minimum_temperature }),
    ...(typeof box.maximum_temperature === "number" && { maximum_temperature: box.maximum_temperature }),
  };
}

function cleaned(amounts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(amounts).map(([id, amount]) => [id, clean(amount)]));
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

/** "75kW" → 75000 in W, "4MJ" → 4000000 in J: the dump writes power with W and energy with J. */
function energy(value: unknown, unit: "W" | "J"): number | undefined {
  const match = typeof value === "string" ? /^([\d.]+(?:e[+-]?\d+)?)\s*([kMGTP]?)([WJ])$/.exec(value) : null;
  if (!match || match[3] !== unit) return undefined;
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

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Drops floating-point noise: 0.007000000000000001 → 0.007. */
function clean(value: number): number {
  return Number(value.toPrecision(12));
}
