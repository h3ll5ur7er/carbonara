// Factorio's module effects: what each module, beacon and quality level does, and how they add up for one machine.
// Hides the game's numbers and its rules for combining them. Source: the Lua prototypes of Factorio 2.1.14
// (wube/factorio-data at tag 2.1.14, see CREDITS.md) and the prototype API's EffectReceiver limits.
// Tested through the reference factories in tools/pack-cli/factorio.mechanics.test.ts.

export type EffectName = "speed" | "productivity" | "consumption" | "pollution" | "quality";
export type Effects = Record<EffectName, number>;
export type ModuleKind = "speed" | "productivity" | "efficiency" | "quality";
export type Tier = 1 | 2 | 3;

export const MODULE_KINDS: readonly ModuleKind[] = ["speed", "productivity", "efficiency", "quality"];

/** Module effects by kind and tier (base/prototypes/item.lua, quality/prototypes/item.lua). */
const MODULES: Record<ModuleKind, Record<Tier, Partial<Effects>>> = {
  speed: {
    1: { speed: 0.2, consumption: 0.5, quality: -0.01 },
    2: { speed: 0.3, consumption: 0.6, quality: -0.015 },
    3: { speed: 0.5, consumption: 0.7, quality: -0.025 },
  },
  productivity: {
    1: { productivity: 0.04, consumption: 0.4, pollution: 0.05, speed: -0.05 },
    2: { productivity: 0.06, consumption: 0.6, pollution: 0.07, speed: -0.1 },
    3: { productivity: 0.1, consumption: 0.8, pollution: 0.1, speed: -0.15 },
  },
  efficiency: { 1: { consumption: -0.3 }, 2: { consumption: -0.4 }, 3: { consumption: -0.5 } },
  quality: {
    1: { quality: 0.01, speed: -0.05 },
    2: { quality: 0.02, speed: -0.05 },
    3: { quality: 0.025, speed: -0.05 },
  },
};

/** The beacon (base/prototypes/entity/entities.lua): slots, effects it takes, distribution effectivity, power. */
export const BEACON = {
  slots: 2,
  effects: ["consumption", "speed", "pollution"],
  distribution: 1.5,
  powerMW: 0.48,
  /** The prototype's `profile` has 100 entries; more beacons than that don't fit around one machine anyway. */
  maxInRange: 100,
};

/** Each of n beacons in range passes on profile[n] of its effect: 1/√n, cut to four decimals as in the prototype. */
function profile(beacons: number): number {
  return Math.floor(1e4 / Math.sqrt(beacons) + 1e-9) / 1e4;
}

/**
 * A module fits where every effect it improves is allowed: a speed module's lower quality doesn't keep it out of a
 * beacon, a productivity module's productivity keeps it out of a recycler.
 */
export function fits(kind: ModuleKind, allowed: readonly string[]): boolean {
  return Object.entries(MODULES[kind][3]).every(([effect, value]) => value <= 0 || allowed.includes(effect));
}

/** Modules by kind, counted. */
export type Modules = Partial<Record<ModuleKind, number>>;

export interface Loadout {
  modules: Modules;
  tier: Tier;
  beacons: number;
  /** The modules in each beacon. */
  beaconModules: Modules;
  beaconTier: Tier;
  /** Built-in effects of the building, such as the foundry's +50 % productivity. */
  base: Partial<Effects>;
  /** Effects the building and the recipe let through. */
  allowed: readonly EffectName[];
}

/**
 * The machine's total effects. Speed and consumption stop at -80 %; productivity and quality at 0, and a quality
 * chance above 100 % can't do more (EffectReceiver's default limits).
 */
export function totalEffects({ modules, tier, beacons, beaconModules, beaconTier, base, allowed }: Loadout): Effects {
  const total: Effects = { speed: 0, productivity: 0, consumption: 0, pollution: 0, quality: 0 };
  const add = (effects: Partial<Effects>, times: number) => {
    for (const [effect, value] of Object.entries(effects) as [EffectName, number][]) total[effect] += value * times;
  };
  for (const [kind, count] of Object.entries(modules) as [ModuleKind, number][]) add(MODULES[kind][tier], count);
  if (beacons > 0) {
    const strength = beacons * BEACON.distribution * profile(beacons);
    for (const [kind, count] of Object.entries(beaconModules) as [ModuleKind, number][]) {
      add(MODULES[kind][beaconTier], count * strength);
    }
  }
  add(base, 1);
  for (const effect of Object.keys(total) as EffectName[]) if (!allowed.includes(effect)) total[effect] = 0;
  return {
    speed: Math.max(-0.8, total.speed),
    productivity: Math.max(0, total.productivity),
    consumption: Math.max(-0.8, total.consumption),
    pollution: Math.max(-0.8, total.pollution),
    quality: Math.min(1, Math.max(0, total.quality)),
  };
}

/** Quality levels in order (quality/prototypes/quality.lua); a variant item is `<id>@<level>` above normal. */
export const QUALITIES = ["normal", "uncommon", "rare", "epic", "legendary"] as const;
/** After the first upgrade (next_probability 1), each further level comes with chain_probability. */
const CHAIN_PROBABILITY = 0.1;

/**
 * What share of a craft at quality level `from` comes out at each level, given the quality chance: one level up
 * with the chance, then each further level with 10 % of what got there, up to legendary.
 */
export function qualityShares(from: number, chance: number): number[] {
  const last = QUALITIES.length - 1;
  const reach = (level: number) => (level <= from ? 1 : chance * CHAIN_PROBABILITY ** (level - from - 1)); // chance of getting at least this far
  const shares = QUALITIES.map(() => 0);
  for (let level = from; level <= last; level++) shares[level] = reach(level) - (level < last ? reach(level + 1) : 0);
  return shares;
}
