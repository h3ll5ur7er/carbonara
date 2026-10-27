// What a factory, or a planned one, adds up to: buildings, power, raw inputs against the map's limits, what
// leaves it and what it's short of, with the pack's names. The planner's proposal card and the totals card
// both read it.
import type { Document } from "../../../contracts/document";
import type { ProposalSummary } from "../../../contracts/managers";
import type { Id, Item, PackData } from "../../../contracts/pack";
import type { AnalysisResults } from "../../../contracts/results";
import { toPerSecond } from "../../../utilities/units";

export interface SummaryFacts {
  /** Buildings to build, all kinds together. */
  machines: number;
  buildings: { id: Id; name: string; count: number }[];
  raw: { item: Item; perSecond: number; limitPerSecond?: number }[];
  byproducts: { item: Item; perSecond: number }[];
  shortfalls: { item: Item; perSecond: number }[];
}

/** Rates by item with the pack's items, largest first. */
export function namedRates(amounts: Record<Id, number>, pack: PackData): { item: Item; perSecond: number }[] {
  const items = new Map(pack.items.map((item) => [item.id, item]));
  const unknown = (id: Id): Item => ({ id, name: id, form: "solid" });
  return Object.entries(amounts)
    .map(([id, perSecond]) => ({ item: items.get(id) ?? unknown(id), perSecond }))
    .sort((a, b) => b.perSecond - a.perSecond);
}

/** A summary with the pack's names and map limits, largest first. */
export function summaryFacts(summary: ProposalSummary, pack: PackData): SummaryFacts {
  const limits = new Map(pack.resources.map((resource) => [resource.item, resource.limit]));
  const buildingNames = new Map(pack.buildings.map((building) => [building.id, building.name]));
  const buildings = Object.entries(summary.buildings)
    .map(([id, count]) => ({ id, name: buildingNames.get(id) ?? id, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return {
    machines: buildings.reduce((total, building) => total + building.count, 0),
    buildings,
    raw: namedRates(summary.raw, pack).map((entry) => {
      const limit = limits.get(entry.item.id);
      return limit === undefined ? entry : { ...entry, limitPerSecond: toPerSecond(limit, pack.units.rate) };
    }),
    byproducts: namedRates(summary.byproducts, pack),
    shortfalls: namedRates(summary.shortfalls, pack),
  };
}

/** A solved document summed up: the totals the analysis reports, power, unused byproducts and shortages. */
export interface FactorySummary extends ProposalSummary {
  /** What leaves the factory through its outputs (sinks), by item. */
  outputs: Record<Id, number>;
}

export function factorySummary(document: Document, pack: PackData, results: AnalysisResults): FactorySummary {
  const recipes = new Map(pack.recipes.map((recipe) => [recipe.id, recipe]));
  const buildings = new Map(pack.buildings.map((building) => [building.id, building]));
  const add = (amounts: Record<Id, number>, item: Id, perSecond: number) =>
    (amounts[item] = (amounts[item] ?? 0) + perSecond);

  let powerMW = 0;
  const outputs: Record<Id, number> = {};
  for (const [id, node] of Object.entries(document.graph.nodes)) {
    const result = results.nodes[id];
    if (!result) continue;
    if (node.kind === "sink") add(outputs, node.item, result.activity);
    if (node.kind !== "recipe") continue;
    // The plugin's power curve where it derives one, else the building's draw at 100% per machine.
    const building = buildings.get(node.building ?? recipes.get(node.recipe)?.buildings[0] ?? "");
    powerMW += result.derived?.powerMW ?? (building?.power?.consume ?? 0) * result.activity;
  }

  const byproducts: Record<Id, number> = {};
  const shortfalls: Record<Id, number> = {};
  for (const diagnostic of results.diagnostics) {
    if (diagnostic.kind === "surplus") add(byproducts, diagnostic.item, diagnostic.perSecond);
    if (diagnostic.kind === "deficit") add(shortfalls, diagnostic.item, diagnostic.perSecond);
  }

  return {
    buildings: results.totals.buildings,
    raw: results.totals.raw,
    byproducts,
    shortfalls,
    powerMW,
    outputs: Object.fromEntries(Object.entries(outputs).filter(([, perSecond]) => perSecond > 0)),
  };
}
