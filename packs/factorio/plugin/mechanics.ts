// Factorio's production mechanics as plugin hooks: modules and beacons in a node's machines, built-in productivity,
// the quality a node crafts at, the Space Age setting, power use, the fuel burner buildings burn, and power
// generation (the neighbour bonus of reactors, plasma temperatures). Hides how a node's settings become its rates and
// metrics; the game's numbers are in effects.ts. Reads what the importer keeps in the pack data: building fields
// `modules`, `base-effect`, `energy`, `fuels`, `burnt`, `reactor`, `generator` and `mod`, and recipe tags
// (`productivity`, `ignored-by-productivity:<item>=<n>`, `no-quality`, and the expansion mods). Tested against
// reference factories in tools/pack-cli/factorio.mechanics.test.ts.
import type { Building, PackData, Recipe } from "../../../src/contracts/pack";
import type {
  EffectiveRecipe,
  FieldDescriptor,
  NodeContext,
  PluginContext,
  PluginProblem,
} from "../../../src/contracts/plugin";
import {
  BEACON,
  BEACON_POWER_BY_QUALITY,
  MODULE_KINDS,
  QUALITIES,
  QUALITY_LEVELS,
  qualityMultiplier,
  fits,
  qualityShares,
  totalEffects,
  type EffectName,
  type Effects,
  type Loadout,
  type ModuleKind,
  type Modules,
  type Tier,
} from "./effects";
import { atTemperature, ELECTRICITY, temperatureOf } from "./energy";

/** Recipe tags of the expansion's mods; without Space Age, recipes carrying one aren't available. */
const EXPANSION_TAGS = ["space-age", "quality", "recycler", "elevated-rails"];
const IGNORED_BY_PRODUCTIVITY = "ignored-by-productivity:";
const RESEARCH = "research:";
const MAXIMUM_PRODUCTIVITY = "maximum-productivity:";
/** RecipePrototype's default `maximum_productivity`: +300 %. */
const DEFAULT_MAXIMUM_PRODUCTIVITY = 3;
const TIERS = ["1", "2", "3"];
/** How many machines one beacon can reach, for the field's range: a 3×3 beacon reaches 9×9 tiles. */
const MAX_MACHINES_PER_BEACON = 12;

const BEACON_KINDS = MODULE_KINDS.filter((kind) => fits(kind, BEACON.effects));
const moduleField = (kind: ModuleKind) => `${kind}Modules`;
const beaconField = (kind: ModuleKind) => `beacon${kind.charAt(0).toUpperCase()}${kind.slice(1)}Modules`;
const label = (kind: ModuleKind) => `${kind.charAt(0).toUpperCase()}${kind.slice(1)} modules`;

const ofQuality = (text: string): FieldDescriptor => ({
  kind: "choice",
  label: text,
  options: [...QUALITIES],
  default: QUALITIES[0],
});

export function nodeFields(building: Building, { pack }: PluginContext): Record<string, FieldDescriptor> {
  const quality: Record<string, FieldDescriptor> = {
    ...energyFields(building, pack),
    machineQuality: ofQuality("Machine quality"),
    quality: ofQuality("Quality"),
  };
  const slots = slotsOf(building);
  if (slots === 0) return quality;
  const count = (text: string, max: number): FieldDescriptor => ({
    kind: "number",
    label: text,
    min: 0,
    max,
    step: 1,
    default: 0,
  });
  const tier = (text: string): FieldDescriptor => ({ kind: "choice", label: text, options: TIERS, default: "3" });
  return {
    ...Object.fromEntries(acceptedKinds(building).map((kind) => [moduleField(kind), count(label(kind), slots)])),
    moduleTier: tier("Module tier"),
    moduleQuality: ofQuality("Module quality"),
    beacons: count("Beacons in range", BEACON.maxInRange),
    ...Object.fromEntries(
      BEACON_KINDS.map((kind) => [beaconField(kind), count(`${label(kind)} per beacon`, BEACON.slots)]),
    ),
    beaconModuleTier: tier("Beacon module tier"),
    beaconModuleQuality: ofQuality("Beacon module quality"),
    beaconQuality: ofQuality("Beacon quality"),
    machinesPerBeacon: {
      kind: "number",
      label: "Machines per beacon",
      min: 1,
      max: MAX_MACHINES_PER_BEACON,
      step: 1,
      default: 1,
    },
    ...quality,
  };
}

/** The Space Age setting, and the level of each productivity research the pack's recipes name. */
export function settingsFields({ pack }: PluginContext): Record<string, FieldDescriptor> {
  const fields: Record<string, FieldDescriptor> = {
    spaceAge: { kind: "toggle", label: "Space Age", default: true },
  };
  for (const [technology, change] of researchOf(pack)) {
    fields[technology] = {
      kind: "number",
      label: humanise(technology),
      min: 0,
      // Levels beyond the default maximum productivity add nothing.
      max: Math.ceil(DEFAULT_MAXIMUM_PRODUCTIVITY / change - 1e-9),
      step: 1,
      unit: "levels",
      default: 0,
    };
  }
  return fields;
}

/**
 * What a node burns, makes and takes beyond its modules: the fuel of a burner (its first fuel, coal where it takes
 * coal, by default), a reactor's neighbours, and the plasma temperature a fusion generator takes.
 */
function energyFields(building: Building, pack: PackData): Record<string, FieldDescriptor> {
  const fields: Record<string, FieldDescriptor> = {};
  const fuels = Object.keys(fuelsOf(building));
  if (fuels.length > 0) fields.fuel = { kind: "choice", label: "Fuel", options: fuels, default: fuels[0] as string };
  const reactor = reactorOf(building);
  if (reactor) {
    fields.neighbours = {
      kind: "number",
      label: "Neighbours per reactor",
      min: 0,
      max: reactor.neighbours,
      // Plasma comes in whole degrees of heat per neighbour; heat adds up, so an array's average does.
      ...(reactor.boosts === "temperature" && { step: 1 }),
      default: 0,
    };
  }
  const fluid = generatorFluidOf(building);
  if (fluid !== undefined) {
    const options = temperaturesOf(pack, fluid).map(String);
    if (options.length > 0) {
      fields.plasma = { kind: "choice", label: "Plasma temperature (°C)", options, default: options[0] as string };
    }
  }
  return fields;
}

export const metrics = {
  power: { label: "Power use", unit: "MW" },
  beaconPower: { label: "Beacon power", unit: "MW" },
};

/** Without Space Age, recipes from the expansion's mods aren't available. */
export function recipeAvailable(recipe: Recipe, { settings }: PluginContext): boolean {
  return settings.spaceAge !== false || !recipe.tags?.some((tag) => EXPANSION_TAGS.includes(tag));
}

export function validate(node: NodeContext, context: PluginContext): PluginProblem[] {
  const warning = (message: string): PluginProblem => ({ kind: "warning", message });
  const { problems } = loadoutOf(node, context);
  const usesQuality = qualityLevelAsked(node) > 0 || Number(node.fields.qualityModules ?? 0) > 0;
  if (usesQuality && !allowsQuality(node.recipe)) {
    problems.push(`${nameOf(node.recipe)} has no quality; making it at normal quality without quality effects`);
  }
  const equipment = ["machineQuality", "moduleQuality", "beaconQuality", "beaconModuleQuality"];
  const betterEquipment = equipment.some((field) => qualityLevel(node.fields[field]) > 0);
  if (context.settings.spaceAge === false) {
    if (node.building.fields?.mod) problems.push(`${node.building.name} needs Space Age`);
    if (usesQuality || betterEquipment) problems.push("Quality needs Space Age");
  }
  const neighbours = Number(node.fields.neighbours ?? 0);
  if (reactorOf(node.building)?.boosts === "temperature" && !Number.isInteger(neighbours)) {
    problems.push(`A fusion reactor has whole neighbours; counting ${Math.floor(neighbours)}, not ${neighbours}`);
  }
  return problems.map(warning);
}

export function effectiveRecipe(node: NodeContext, context: PluginContext): EffectiveRecipe {
  const { recipe } = node;
  const { pack } = context;
  const effects = effectsOf(node, context);
  const level = allowsQuality(recipe) ? qualityLevelAsked(node) : 0;
  const items = itemIdsOf(pack);
  // Solid items have a variant per quality level; fluids have none.
  const hasQuality = (item: string) => items.has(`${item}@${QUALITIES[1]}`);
  const variant = (item: string, at: number) => (at === 0 || !hasQuality(item) ? item : `${item}@${QUALITIES[at]}`);
  const ignored = ignoredByProductivity(recipe);
  const inputs: Record<string, number> = {};
  for (const [item, amount] of Object.entries(recipe.in)) inputs[variant(item, level)] = amount;
  const out: Record<string, number> = {};
  const shares = qualityShares(level, effects.quality);
  for (const [item, amount] of Object.entries(recipe.out)) {
    const kept = Object.hasOwn(ignored, item) ? (ignored[item] as number) : 0;
    const made = amount + Math.max(0, amount - kept) * effects.productivity;
    if (!hasQuality(item)) {
      add(out, item, made);
      continue;
    }
    shares.forEach((share, at) => {
      if (share > 0) add(out, variant(item, at), made * share);
    });
  }
  // A better machine crafts faster; a generator of better quality makes and burns more, a crafting machine doesn't.
  const machine = qualityMultiplier(qualityLevel(node.fields.machineQuality));
  const time = recipe.time / (1 + effects.speed) / machine;
  boostByNeighbours(node, out);
  takeHotterPlasma(node, inputs, out);
  const generates = recipe.tags?.includes("power") === true;
  burnFuel(node, time, effects.consumption, generates ? machine : 1, inputs, out);
  return { time, in: inputs, out };
}

/**
 * A reactor makes 100 % more for each neighbour (the prototype's `neighbour_bonus`) and burns no more for it: more
 * heat from a nuclear reactor, hotter plasma from a fusion reactor (whole neighbours only, as plasma comes in
 * whole steps of its temperature).
 */
function boostByNeighbours(node: NodeContext, out: Record<string, number>): void {
  const reactor = reactorOf(node.building);
  if (!reactor) return;
  const neighbours = Number(node.fields.neighbours ?? 0);
  if (reactor.boosts === "heat") {
    for (const item of Object.keys(out)) out[item] = (out[item] as number) * (1 + reactor.bonus * neighbours);
    return;
  }
  for (const item of Object.keys(out)) {
    const made = temperatureOf(item);
    if (!made) continue;
    const hotter = atTemperature(made.fluid, made.temperature * (1 + reactor.bonus * Math.floor(neighbours)));
    const amount = out[item] as number;
    Reflect.deleteProperty(out, item);
    out[hotter] = amount;
  }
}

/**
 * A fusion generator makes as much power from hotter plasma, so it takes less of it, and gives back as much hot
 * coolant as it takes plasma.
 */
function takeHotterPlasma(node: NodeContext, inputs: Record<string, number>, out: Record<string, number>): void {
  const fluid = generatorFluidOf(node.building);
  const chosen = Number(node.fields.plasma);
  if (fluid === undefined || !Number.isFinite(chosen) || chosen <= 0) return;
  for (const item of Object.keys(inputs)) {
    const taken = temperatureOf(item);
    if (taken?.fluid !== fluid || taken.temperature === chosen) continue;
    const share = taken.temperature / chosen;
    const amount = inputs[item] as number;
    Reflect.deleteProperty(inputs, item);
    inputs[atTemperature(fluid, chosen)] = amount * share;
    for (const made of Object.keys(out)) if (made !== ELECTRICITY) out[made] = (out[made] as number) * share;
  }
}

/**
 * A burner building burns its usage, with its consumption effect, for as long as a craft takes: that much of the
 * node's fuel (by its energy, through the burner's effectivity) goes in, and what it burns into comes out.
 */
function burnFuel(
  node: NodeContext,
  time: number,
  consumption: number,
  /** How much more the building burns than its prototype says: generators of better quality burn more. */
  scale: number,
  inputs: Record<string, number>,
  out: Record<string, number>,
): void {
  const { building, fields } = node;
  const energy = building.fields?.energy;
  const fuels = fuelsOf(building);
  const fuel = String(fields.fuel ?? Object.keys(fuels)[0] ?? "");
  const value = Object.hasOwn(fuels, fuel) ? Number(fuels[fuel]) : 0;
  if (energy?.source !== "burner" || value <= 0) return;
  const usage = Number(energy.usage ?? 0) * scale;
  const megajoules = (usage * (time / building.speed) * (1 + consumption)) / effectivityOf(building);
  const burnt = megajoules / value;
  add(inputs, fuel, burnt);
  const burntInto = building.fields?.burnt;
  const ash = burntInto && Object.hasOwn(burntInto, fuel) ? burntInto[fuel] : undefined;
  if (typeof ash === "string") add(out, ash, burnt);
}

/** Adds to an amount by item, own keys only (an item could be called `constructor`). */
function add(amounts: Record<string, number>, item: string, amount: number): void {
  amounts[item] = (Object.hasOwn(amounts, item) ? (amounts[item] as number) : 0) + amount;
}

/**
 * Power in MW. Working machines draw their energy usage with the consumption effect; every machine built draws its
 * drain, idle or not, and so do the beacons around them. Buildings that draw no electricity (burners, generators)
 * have no power metric: what burners burn is an input of their recipe.
 */
export function derive(node: NodeContext & { machines: number }, context: PluginContext): Record<string, number> {
  const { building, machines, fields } = node;
  if (building.power?.consume === undefined) return {};
  const drain = Number(building.fields?.energy?.drain ?? 0);
  const working = machines * (building.power.consume - drain) * (1 + effectsOf(node, context).consumption);
  const built = Math.abs(machines - Math.round(machines)) < 1e-9 ? Math.round(machines) : Math.ceil(machines);
  const beacons = slotsOf(building) > 0 ? Number(fields.beacons ?? 0) : 0;
  const perBeacon = Number(fields.machinesPerBeacon ?? 1);
  return {
    power: working + built * drain,
    ...(beacons > 0 && {
      beaconPower: ((built * beacons) / perBeacon) * BEACON.powerMW * beaconPowerOf(fields.beaconQuality),
    }),
  };
}

function effectsOf(node: NodeContext, context: PluginContext): Effects {
  return totalEffects(loadoutOf(node, context).loadout);
}

/**
 * The node's modules as the game would take them: productivity modules only where the recipe allows productivity,
 * then as many as fit the slots, in field order (speed, productivity, efficiency, quality), and the same for each
 * beacon. Problems say what was left out.
 */
function loadoutOf(node: NodeContext, { settings }: PluginContext): { loadout: Loadout; problems: string[] } {
  const { building, recipe, fields } = node;
  const problems: string[] = [];
  const slots = slotsOf(building);
  const counted = (kinds: readonly ModuleKind[], field: (kind: ModuleKind) => string): Modules =>
    Object.fromEntries(kinds.map((kind) => [kind, Number(fields[field(kind)] ?? 0)]));
  const modules = slots > 0 ? counted(acceptedKinds(building), moduleField) : {};
  if ((modules.productivity ?? 0) > 0 && !allowsProductivity(recipe)) {
    problems.push(`${nameOf(recipe)} takes no productivity modules; leaving them out`);
    modules.productivity = 0;
  }
  const fitted = fill(modules, slots, (left, total) =>
    problems.push(`${building.name} has ${slots} module slots; leaving out ${left} of ${total} modules`),
  );
  const beaconModules = fill(slots > 0 ? counted(BEACON_KINDS, beaconField) : {}, BEACON.slots, (left, total) =>
    problems.push(`A beacon has ${BEACON.slots} module slots; leaving out ${left} of ${total} modules`),
  );
  const allowed = String(building.fields?.modules?.effects ?? "")
    .split(",")
    .filter((effect): effect is EffectName =>
      effect === "productivity" ? allowsProductivity(recipe) : effect !== "quality" || allowsQuality(recipe),
    );
  return {
    loadout: {
      modules: fitted,
      tier: tierOf(fields.moduleTier),
      moduleQuality: qualityLevel(fields.moduleQuality),
      beacons: slots > 0 ? Number(fields.beacons ?? 0) : 0,
      beaconModules,
      beaconTier: tierOf(fields.beaconModuleTier),
      beaconModuleQuality: qualityLevel(fields.beaconModuleQuality),
      beaconQuality: qualityLevel(fields.beaconQuality),
      research: researchBonus(recipe, settings),
      maximumProductivity: maximumProductivityOf(recipe),
      base: baseEffectOf(building),
      allowed,
    },
    problems,
  };
}

/** Takes modules in order until the slots are full; `overflow` hears how many were left out of how many. */
function fill(modules: Modules, slots: number, overflow: (left: number, total: number) => void): Modules {
  const total = Object.values(modules).reduce((sum, count) => sum + count, 0);
  if (total > slots) overflow(total - slots, total);
  let free = slots;
  const fitted: Modules = {};
  for (const [kind, count] of Object.entries(modules) as [ModuleKind, number][]) {
    fitted[kind] = Math.min(count, free);
    free -= fitted[kind];
  }
  return fitted;
}

/** The fuels a burner building takes, with their energy in MJ; the first is the default. */
function fuelsOf(building: Building): Record<string, number | string | boolean> {
  return building.fields?.fuels ?? {};
}

function effectivityOf(building: Building): number {
  const effectivity = Number(building.fields?.energy?.effectivity ?? 1);
  return effectivity > 0 ? effectivity : 1;
}

/** A reactor's neighbour bonus: per neighbour, at most how many, and whether it makes more heat or hotter plasma. */
function reactorOf(
  building: Building,
): { bonus: number; neighbours: number; boosts: "heat" | "temperature" } | undefined {
  const reactor = building.fields?.reactor;
  const bonus = Number(reactor?.["neighbour-bonus"] ?? 0);
  if (!reactor || !(bonus > 0)) return undefined;
  return {
    bonus,
    neighbours: Number(reactor.neighbours ?? 0),
    boosts: reactor.boosts === "temperature" ? "temperature" : "heat",
  };
}

/** The fluid a fusion generator takes at any of its temperatures. */
function generatorFluidOf(building: Building): string | undefined {
  const fluid = building.fields?.generator?.fluid;
  return typeof fluid === "string" ? fluid : undefined;
}

/** The temperatures a fluid comes at in the pack, from its variants (`fusion-plasma@2000000`), coolest first. */
function temperaturesOf(pack: PackData, fluid: string): number[] {
  return pack.items
    .flatMap((item) => {
      const variant = temperatureOf(item.id);
      return variant?.fluid === fluid ? [variant.temperature] : [];
    })
    .sort((a, b) => a - b);
}

/** A quality's level (its strength: legendary 5) from a field's value; normal for anything else. */
function qualityLevel(value: unknown): number {
  const index = QUALITIES.indexOf(String(value ?? QUALITIES[0]) as (typeof QUALITIES)[number]);
  return index > 0 ? (QUALITY_LEVELS[index] ?? 0) : 0;
}

function beaconPowerOf(value: unknown): number {
  const index = QUALITIES.indexOf(String(value ?? QUALITIES[0]) as (typeof QUALITIES)[number]);
  return BEACON_POWER_BY_QUALITY[Math.max(0, index)] ?? 1;
}

/** Productivity from the research the recipe's `research:<technology>=<change>` tags name, at the save's levels. */
function researchBonus(recipe: Recipe, settings: Record<string, unknown>): number {
  let bonus = 0;
  for (const tag of recipe.tags ?? []) {
    const [technology, change] = tag.startsWith(RESEARCH) ? tag.slice(RESEARCH.length).split("=") : [];
    const level = technology !== undefined && Object.hasOwn(settings, technology) ? Number(settings[technology]) : 0;
    if (Number.isFinite(level) && Number.isFinite(Number(change))) bonus += level * Number(change);
  }
  return bonus;
}

/** The productivity research the pack's recipes name, with their change per level; built once per pack. */
const researchCache = new WeakMap<PackData, Map<string, number>>();
function researchOf(pack: PackData): Map<string, number> {
  let research = researchCache.get(pack);
  if (!research) {
    research = new Map();
    for (const recipe of pack.recipes) {
      for (const tag of recipe.tags ?? []) {
        if (!tag.startsWith(RESEARCH)) continue;
        const [technology, change] = tag.slice(RESEARCH.length).split("=");
        if (technology && Number(change) > 0) research.set(technology, Number(change));
      }
    }
    researchCache.set(pack, research);
  }
  return research;
}

function maximumProductivityOf(recipe: Recipe): number {
  const tag = recipe.tags?.find((entry) => entry.startsWith(MAXIMUM_PRODUCTIVITY));
  const maximum = Number(tag?.slice(MAXIMUM_PRODUCTIVITY.length));
  return tag !== undefined && Number.isFinite(maximum) ? maximum : DEFAULT_MAXIMUM_PRODUCTIVITY;
}

/** "steel-plate-productivity" → "Steel plate productivity", as the game's English names read. */
function humanise(id: string): string {
  const words = id.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function slotsOf(building: Building): number {
  return Number(building.fields?.modules?.slots ?? 0);
}

/** The kinds of module a building takes, by its allowed effects. */
function acceptedKinds(building: Building): ModuleKind[] {
  const allowed = String(building.fields?.modules?.effects ?? "").split(",");
  return MODULE_KINDS.filter((kind) => fits(kind, allowed));
}

function baseEffectOf(building: Building): Partial<Effects> {
  const base = building.fields?.["base-effect"] ?? {};
  return Object.fromEntries(Object.entries(base).map(([effect, value]) => [effect, Number(value)]));
}

const tierOf = (value: unknown): Tier => (value === "1" ? 1 : value === "2" ? 2 : 3);

function qualityLevelAsked(node: NodeContext): number {
  return Math.max(0, QUALITIES.indexOf(String(node.fields.quality ?? "normal") as (typeof QUALITIES)[number]));
}

const allowsProductivity = (recipe: Recipe) => recipe.tags?.includes("productivity") === true;
const allowsQuality = (recipe: Recipe) => recipe.tags?.includes("no-quality") !== true;
const nameOf = (recipe: Recipe) => recipe.name ?? recipe.id;

/** The part of each result productivity doesn't multiply, from the recipe's `ignored-by-productivity:` tags. */
function ignoredByProductivity(recipe: Recipe): Record<string, number> {
  const ignored: Record<string, number> = {};
  for (const tag of recipe.tags ?? []) {
    if (!tag.startsWith(IGNORED_BY_PRODUCTIVITY)) continue;
    const [item, amount] = tag.slice(IGNORED_BY_PRODUCTIVITY.length).split("=");
    if (item && Number.isFinite(Number(amount))) ignored[item] = Number(amount);
  }
  return ignored;
}

/** The pack's item ids, to tell items with quality variants from fluids; built once per pack. */
const itemIdCache = new WeakMap<PackData, Set<string>>();
function itemIdsOf(pack: PackData): Set<string> {
  let ids = itemIdCache.get(pack);
  if (!ids) {
    ids = new Set(pack.items.map((item) => item.id));
    itemIdCache.set(pack, ids);
  }
  return ids;
}
