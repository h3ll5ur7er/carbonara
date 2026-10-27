// Satisfactory's production mechanics: clock speed, power shards, somersloops (production amplification), the
// alternate recipes a save has unlocked, and the power curve. Hides the game's numbers and formulas.
// Source: the game's own data file, Satisfactory 1.1 CommunityResources/Docs/en-US.json (see CREDITS.md):
// mMaxPotential, mExtraPotential of the Power Shard, mProductionShardSlotSize, mProductionShardBoostMultiplier,
// mPowerConsumptionExponent and mProductionBoostPowerConsumptionExponent. Tested against reference factories in
// tools/pack-cli/satisfactory.mechanics.test.ts.
import type { Building, Recipe } from "../../../src/contracts/pack";
import {
  isAlternate,
  unlockedRecipes,
  type EffectiveRecipe,
  type FieldDescriptor,
  type NodeContext,
  type PluginConstraint,
  type PluginContext,
  type PluginNode,
  type PluginProblem,
} from "../../../src/contracts/plugin";

/** Clock speed without power shards, in percent (mMaxPotential 1.0). */
const BASE_CLOCK = 100;
/** Each Power Shard raises the clock limit by 50 % (mExtraPotential 0.5); a building takes three. */
const CLOCK_PER_SHARD = 50;
const MAX_SHARDS = 3;
/** Power use grows with clock ^ 1.321929 (mPowerConsumptionExponent, log2 2.5) for every consumer. */
const POWER_EXPONENT = 1.321929;
/** … and with the production boost squared (mProductionBoostPowerConsumptionExponent). */
const BOOST_POWER_EXPONENT = 2;

/**
 * Somersloop slots per building (mProductionShardSlotSize); filling them all doubles the output (each adds
 * 1 / slots, mProductionShardBoostMultiplier). Docs lists the Smelter with 0 slots, but its boost multiplier is 1 and
 * the game's Smelter takes one somersloop, so it has 1 here. Buildings that can't be amplified are left out.
 */
const AMPLIFIER_SLOTS: Record<string, number> = {
  smelter: 1,
  constructor: 1,
  assembler: 2,
  foundry: 2,
  refinery: 2,
  converter: 2,
  manufacturer: 4,
  blender: 4,
  "particle-accelerator": 4,
  "quantum-encoder": 4,
};

export function nodeFields(building: Building): Record<string, FieldDescriptor> {
  const clock = building.fields?.clock;
  if (!clock) return {};
  const fields: Record<string, FieldDescriptor> = {
    clock: {
      kind: "number",
      label: "Clock speed",
      min: Number(clock.min ?? 1),
      max: Number(clock.max ?? BASE_CLOCK + MAX_SHARDS * CLOCK_PER_SHARD),
      step: 0.0001,
      unit: "%",
      default: Number(clock.default ?? BASE_CLOCK),
    },
    shards: { kind: "number", label: "Power shards", min: 0, max: MAX_SHARDS, step: 1, default: 0 },
  };
  const slots = AMPLIFIER_SLOTS[building.id];
  if (slots) fields.somersloops = { kind: "number", label: "Somersloops", min: 0, max: slots, step: 1, default: 0 };
  return fields;
}

export function settingsFields(): Record<string, FieldDescriptor> {
  return {
    limitSomersloops: { kind: "toggle", label: "Limit somersloops", default: false },
    somersloops: { kind: "number", label: "Somersloops available", min: 0, max: 1000, step: 1, default: 0 },
  };
}

export const metrics = {
  power: { label: "Power use", unit: "MW" },
  powerGenerated: { label: "Power generated", unit: "MW" },
};

/** No save profile means every alternate is available. */
export function recipeAvailable(recipe: Recipe, { settings }: PluginContext): boolean {
  const unlocked = unlockedRecipes(settings);
  return !isAlternate(recipe) || unlocked === undefined || unlocked.includes(recipe.id);
}

export function effectiveRecipe(node: NodeContext): EffectiveRecipe {
  const { recipe } = node;
  const speed = clockOf(node) / BASE_CLOCK;
  const boost = boostOf(node);
  const out = Object.fromEntries(Object.entries(recipe.out).map(([item, amount]) => [item, amount * boost]));
  return { time: recipe.time / speed, in: recipe.in, out };
}

export function validate(node: NodeContext): PluginProblem[] {
  const asked = Number(node.fields.clock ?? BASE_CLOCK);
  const limit = clockLimit(node);
  if (asked <= limit) return [];
  const needed = Math.ceil((asked - BASE_CLOCK) / CLOCK_PER_SHARD);
  return [
    {
      kind: "warning",
      message: `Clock speed ${asked} % needs ${needed} power shard${needed === 1 ? "" : "s"}; running at ${limit} %`,
    },
  ];
}

/** With the budget on, the somersloops in all nodes (per machine × machines) stay within the save's. */
export function constraints(nodes: PluginNode[], { settings }: PluginContext): PluginConstraint[] {
  if (settings.limitSomersloops !== true) return [];
  const terms = nodes.flatMap((node) => {
    const somersloops = somersloopsOf(node);
    return somersloops > 0 ? [{ node: node.id, coefficient: somersloops }] : [];
  });
  return [{ terms, op: "atMost", rhs: Number(settings.somersloops ?? 0) }];
}

/**
 * Power in MW. A fractional machine count is built the way the game would: whole machines at the node's clock and
 * one more running slower for the rest, which draws less than its share because the curve isn't linear.
 */
export function derive(node: NodeContext & { machines: number }): Record<string, number> {
  const { building, machines } = node;
  const clock = clockOf(node);
  const count = Math.abs(machines - Math.round(machines)) < 1e-9 ? Math.round(machines) : machines;
  const whole = Math.floor(count);
  const rest = count - whole;
  const total = (perMachine: (clock: number) => number) =>
    whole * perMachine(clock) + (rest > 0 ? perMachine(clock * rest) : 0);
  const produce = building.power?.produce ?? 0;
  if (produce > 0) return { powerGenerated: total((at) => produce * (at / BASE_CLOCK)) };
  const consume = building.power?.consume ?? 0;
  const boost = boostOf(node) ** BOOST_POWER_EXPONENT;
  return { power: total((at) => consume * boost * (at / BASE_CLOCK) ** POWER_EXPONENT) };
}

function clockLimit(node: NodeContext): number {
  return BASE_CLOCK + Math.min(MAX_SHARDS, Number(node.fields.shards ?? 0)) * CLOCK_PER_SHARD;
}

/** The clock the node runs at: what it asks for, within what its shards allow. */
function clockOf(node: NodeContext): number {
  return Math.min(Number(node.fields.clock ?? BASE_CLOCK), clockLimit(node));
}

function somersloopsOf(node: NodeContext): number {
  const slots = AMPLIFIER_SLOTS[node.building.id] ?? 0;
  return Math.min(slots, Number(node.fields.somersloops ?? 0));
}

/** Production boost: 1 plus each filled slot's share. */
function boostOf(node: NodeContext): number {
  const slots = AMPLIFIER_SLOTS[node.building.id] ?? 0;
  return slots > 0 ? 1 + somersloopsOf(node) / slots : 1;
}
