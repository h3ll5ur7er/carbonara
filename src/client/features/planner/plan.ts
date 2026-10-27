// The goal planner's rules in the client: goals in the document's unit become targets per second (and back), a
// proposal becomes a ghost, and its undo step gets a name. The preferred buildings and resource weights are saved
// with the document (`settings.planning`), each change one `setSettings` edit.
import type { Graph, PlanningSettings } from "../../../contracts/document";
import type { PlanTarget, Proposal } from "../../../contracts/managers";
import type { Building, Id, Item, PackData, RateUnit } from "../../../contracts/pack";
import { clean, formatNumber } from "../../../utilities/numbers";
import { fromPerSecond, toPerSecond } from "../../../utilities/units";
import type { Point } from "../../canvas/adapter";
import type { Ghost } from "../../canvas/ghost/ghost";
import { formatRate } from "../../canvas/model/format";

/** One goal as the form holds it: an item (none picked yet) and a rate in the document's unit. */
export interface GoalRow {
  key: number;
  item: Id | null;
  rate: number;
}

/** The goals that are complete, as the planning manager wants them. */
export function targetsPerSecond(rows: GoalRow[], unit: RateUnit): PlanTarget[] {
  return rows.flatMap((row) =>
    row.item !== null && row.rate > 0 ? [{ item: row.item, perSecond: toPerSecond(row.rate, unit) }] : [],
  );
}

/** A proposal's targets as goals to adjust, in the document's unit. */
export function goalsOf(targets: PlanTarget[], unit: RateUnit, key: () => number): GoalRow[] {
  return targets.map((target) => ({
    key: key(),
    item: target.item,
    rate: clean(fromPerSecond(target.perSecond, unit)),
  }));
}

/** The proposal as a ghost: the nodes and flows it adds, where it adds them, moved by `offset`. */
export function proposalGhost(proposal: Proposal, offset: Point): Ghost {
  const graph: Graph = { nodes: {}, edges: {} };
  const positions: Ghost["positions"] = {};
  for (const command of proposal.commands) {
    if (command.type === "addNode" && command.id !== undefined) {
      graph.nodes[command.id] = command.node;
      positions[command.id] = command.position;
    } else if (command.type === "connect" && command.id !== undefined) {
      graph.edges[command.id] = command.edge;
    }
  }
  return { graph, positions, results: proposal.results, placement: { mode: "fixed", offset }, label: "Proposal" };
}

/** "Plan 15/min Motor": how the accepted proposal reads in the undo history. */
export function planLabel(targets: PlanTarget[], pack: PackData, unit: RateUnit): string {
  const names = new Map(pack.items.map((item) => [item.id, item.name]));
  const parts = targets.map((target) => {
    const rate = formatRate(target.perSecond, unit);
    return `${rate.value}${rate.unit} ${names.get(target.item) ?? target.item}`;
  });
  return `Plan ${parts.join(", ")}`;
}

/** Buildings that stand in for each other: a default building and the others its recipes may run in. */
export interface BuildingFamily {
  /** The default building of the family's recipes (the first of their buildings). */
  base: Building;
  /** Every building of the family, the base first, in pack order. */
  members: Building[];
}

/**
 * The pack's building families, for choosing which building recipes run in: one per default building that has
 * alternatives, merged with the family it's itself an alternative in (assembler 2 recipes join assembler 1's).
 */
export function buildingFamilies(pack: PackData): BuildingFamily[] {
  const families = new Map<Id, Set<Id>>();
  for (const { buildings } of pack.recipes) {
    const [base] = buildings;
    if (base === undefined || buildings.length < 2) continue;
    const members = families.get(base) ?? new Set([base]);
    buildings.forEach((building) => members.add(building));
    families.set(base, members);
  }
  for (const [base, members] of families) {
    const host = [...families].find(([other, them]) => other !== base && them.has(base));
    if (!host) continue;
    members.forEach((member) => host[1].add(member));
    families.delete(base);
  }
  const order = pack.buildings;
  return [...families].flatMap(([base, members]) => {
    const found = order.find((building) => building.id === base);
    if (!found) return [];
    const others = order.filter((building) => members.has(building.id) && building.id !== base);
    return [{ base: found, members: [found, ...others] }];
  });
}

/** The preferred buildings (`PlanOptions.buildings`) with a family's choice changed; the base means none. */
export function preferBuilding(buildings: readonly Id[], family: BuildingFamily, choice: Id): Id[] {
  const members = new Set(family.members.map((member) => member.id));
  const others = buildings.filter((building) => !members.has(building));
  return choice === family.base.id ? others : [...others, choice];
}

/** A change to the planner's defaults saved with the document, as one `setSettings` edit; null when none are left. */
export interface PlanningEdit {
  planning: PlanningSettings | null;
  label: string;
}

/** The saved defaults with a family's building changed (`preferBuilding`). */
export function buildingEdit(saved: PlanningSettings | undefined, family: BuildingFamily, choice: Id): PlanningEdit {
  const buildings = preferBuilding(saved?.buildings ?? [], family, choice);
  const name = family.members.find((member) => member.id === choice)?.name ?? choice;
  return { planning: tidy({ ...saved, buildings }), label: `Run ${family.base.name} recipes in the ${name}` };
}

/** The saved defaults with a raw resource's weight changed; a weight of 1 is the default and isn't kept. */
export function weightEdit(
  saved: PlanningSettings | undefined,
  pack: PackData,
  item: Id,
  weight: number,
): PlanningEdit {
  const others = Object.fromEntries(Object.entries(saved?.resourceWeights ?? {}).filter(([id]) => id !== item));
  const resourceWeights = weight === 1 ? others : { ...others, [item]: weight };
  const name = pack.items.find(({ id }) => id === item)?.name ?? item;
  return { planning: tidy({ ...saved, resourceWeights }), label: `Weigh ${name} at ${formatNumber(weight)}` };
}

/** Planning settings without empty lists; null when nothing is left to save. */
function tidy({ buildings, resourceWeights }: PlanningSettings): PlanningSettings | null {
  const kept: PlanningSettings = {
    ...(buildings && buildings.length > 0 && { buildings }),
    ...(resourceWeights && Object.keys(resourceWeights).length > 0 && { resourceWeights }),
  };
  return Object.keys(kept).length > 0 ? kept : null;
}

/**
 * Items for the goal picker that match every word of the query (in the name, an alias or the id): names
 * starting with the query first, then names with a word starting with it, then the rest. Without a query,
 * what the pack's recipes make comes before raw resources.
 */
export function findItems(pack: PackData, query: string): Item[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const made = new Set(pack.recipes.flatMap((recipe) => Object.keys(recipe.out)));
  const ranked = pack.items.flatMap((item, index) => {
    const name = item.name.toLowerCase();
    const haystack = [name, item.id, ...(item.aliases ?? [])].join(" ").toLowerCase();
    if (!words.every((word) => haystack.includes(word))) return [];
    const phrase = words.join(" ");
    const tier =
      words.length === 0
        ? made.has(item.id)
          ? 0
          : 1
        : name.startsWith(phrase)
          ? 0
          : name.split(/\s+/).some((word) => word.startsWith(phrase))
            ? 1
            : 2;
    return [{ item, tier, index }];
  });
  return ranked.sort((a, b) => a.tier - b.tier || a.index - b.index).map((entry) => entry.item);
}
