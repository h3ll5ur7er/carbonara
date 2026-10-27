// Factorio's production mechanics as plugin hooks: modules and beacons in a node's machines, built-in productivity,
// the quality a node crafts at, the Space Age setting, and power. Hides how a node's settings become its rates and
// metrics; the game's numbers are in effects.ts. Reads what the importer keeps in the pack data: building fields
// `modules`, `base-effect`, `energy` and `mod`, and recipe tags (`productivity`, `ignored-by-productivity:<item>=<n>`,
// `no-quality`, and the expansion mods). Tested against reference factories in
// tools/pack-cli/factorio.mechanics.test.ts.
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
  MODULE_KINDS,
  QUALITIES,
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

/** Recipe tags of the expansion's mods; without Space Age, recipes carrying one aren't available. */
const EXPANSION_TAGS = ["space-age", "quality", "recycler", "elevated-rails"];
const IGNORED_BY_PRODUCTIVITY = "ignored-by-productivity:";
const TIERS = ["1", "2", "3"];
/** How many machines one beacon can reach, for the field's range: a 3×3 beacon reaches 9×9 tiles. */
const MAX_MACHINES_PER_BEACON = 12;

const BEACON_KINDS = MODULE_KINDS.filter((kind) => fits(kind, BEACON.effects));
const moduleField = (kind: ModuleKind) => `${kind}Modules`;
const beaconField = (kind: ModuleKind) => `beacon${kind.charAt(0).toUpperCase()}${kind.slice(1)}Modules`;
const label = (kind: ModuleKind) => `${kind.charAt(0).toUpperCase()}${kind.slice(1)} modules`;

export function nodeFields(building: Building): Record<string, FieldDescriptor> {
  const quality: Record<string, FieldDescriptor> = {
    quality: { kind: "choice", label: "Quality", options: [...QUALITIES], default: "normal" },
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
    beacons: count("Beacons in range", BEACON.maxInRange),
    ...Object.fromEntries(
      BEACON_KINDS.map((kind) => [beaconField(kind), count(`${label(kind)} per beacon`, BEACON.slots)]),
    ),
    beaconModuleTier: tier("Beacon module tier"),
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

export function settingsFields(): Record<string, FieldDescriptor> {
  return { spaceAge: { kind: "toggle", label: "Space Age", default: true } };
}

export const metrics = {
  power: { label: "Power use", unit: "MW" },
  beaconPower: { label: "Beacon power", unit: "MW" },
  fuel: { label: "Fuel burnt", unit: "MW" },
};

/** Without Space Age, recipes from the expansion's mods aren't available. */
export function recipeAvailable(recipe: Recipe, { settings }: PluginContext): boolean {
  return settings.spaceAge !== false || !recipe.tags?.some((tag) => EXPANSION_TAGS.includes(tag));
}

export function validate(node: NodeContext, { settings }: PluginContext): PluginProblem[] {
  const warning = (message: string): PluginProblem => ({ kind: "warning", message });
  const { problems } = loadoutOf(node);
  const usesQuality = qualityLevelAsked(node) > 0 || Number(node.fields.qualityModules ?? 0) > 0;
  if (usesQuality && !allowsQuality(node.recipe)) {
    problems.push(`${nameOf(node.recipe)} has no quality; making it at normal quality without quality effects`);
  }
  if (settings.spaceAge === false) {
    if (node.building.fields?.mod) problems.push(`${node.building.name} needs Space Age`);
    if (usesQuality) problems.push("Quality needs Space Age");
  }
  return problems.map(warning);
}

export function effectiveRecipe(node: NodeContext, { pack }: PluginContext): EffectiveRecipe {
  const { recipe } = node;
  const effects = effectsOf(node);
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
    const made = amount + Math.max(0, amount - (ignored[item] ?? 0)) * effects.productivity;
    if (!hasQuality(item)) {
      out[item] = (out[item] ?? 0) + made;
      continue;
    }
    shares.forEach((share, at) => {
      if (share > 0) out[variant(item, at)] = (out[variant(item, at)] ?? 0) + made * share;
    });
  }
  return { time: recipe.time / (1 + effects.speed), in: inputs, out };
}

/**
 * Power in MW. Working machines draw their energy usage with the consumption effect; every machine built draws its
 * drain, idle or not, and so do the beacons around them. Burner buildings burn fuel instead.
 */
export function derive(node: NodeContext & { machines: number }): Record<string, number> {
  const { building, machines, fields } = node;
  const energy = building.fields?.energy;
  const drain = Number(energy?.drain ?? 0);
  const working = machines * ((building.power?.consume ?? 0) - drain) * (1 + effectsOf(node).consumption);
  if (energy?.source === "burner") return { fuel: working };
  if (energy?.source !== undefined) return {};
  const built = Math.abs(machines - Math.round(machines)) < 1e-9 ? Math.round(machines) : Math.ceil(machines);
  const beacons = slotsOf(building) > 0 ? Number(fields.beacons ?? 0) : 0;
  const perBeacon = Number(fields.machinesPerBeacon ?? 1);
  return {
    power: working + built * drain,
    ...(beacons > 0 && { beaconPower: ((built * beacons) / perBeacon) * BEACON.powerMW }),
  };
}

function effectsOf(node: NodeContext): Effects {
  return totalEffects(loadoutOf(node).loadout);
}

/**
 * The node's modules as the game would take them: productivity modules only where the recipe allows productivity,
 * then as many as fit the slots, in field order (speed, productivity, efficiency, quality), and the same for each
 * beacon. Problems say what was left out.
 */
function loadoutOf(node: NodeContext): { loadout: Loadout; problems: string[] } {
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
      beacons: slots > 0 ? Number(fields.beacons ?? 0) : 0,
      beaconModules,
      beaconTier: tierOf(fields.beaconModuleTier),
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
