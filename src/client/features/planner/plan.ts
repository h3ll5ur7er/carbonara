// The goal planner's rules in the client: goals in the document's unit become targets per second, a proposal
// becomes a ghost and, accepted, the commands that add it where the ghost was left; summaries for its card.
import type { Command } from "../../../contracts/commands";
import type { Graph } from "../../../contracts/document";
import type { PlanTarget, Proposal, ProposalSummary } from "../../../contracts/managers";
import type { Id, Item, PackData, RateUnit } from "../../../contracts/pack";
import { toPerSecond } from "../../../utilities/units";
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

/** The proposal's commands with its nodes moved by `offset`, where the ghost was left. */
export function acceptedCommands(proposal: Proposal, offset: Point): Command[] {
  return proposal.commands.map((command) =>
    command.type === "addNode"
      ? {
          ...command,
          position: { ...command.position, x: command.position.x + offset.x, y: command.position.y + offset.y },
        }
      : command,
  );
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

export interface SummaryFacts {
  /** Buildings to build, all kinds together. */
  machines: number;
  buildings: { id: Id; name: string; count: number }[];
  raw: { item: Item; perSecond: number; limitPerSecond?: number }[];
  byproducts: { item: Item; perSecond: number }[];
  shortfalls: { item: Item; perSecond: number }[];
}

/** A summary with the pack's names and map limits, largest first. */
export function summaryFacts(summary: ProposalSummary, pack: PackData): SummaryFacts {
  const items = new Map(pack.items.map((item) => [item.id, item]));
  const item = (id: Id): Item => items.get(id) ?? { id, name: id, form: "solid" };
  const limits = new Map(pack.resources.map((resource) => [resource.item, resource.limit]));
  const largest = <T extends { perSecond: number }>(list: T[]) => list.sort((a, b) => b.perSecond - a.perSecond);
  const rates = (amounts: Record<Id, number>) =>
    largest(Object.entries(amounts).map(([id, perSecond]) => ({ item: item(id), perSecond })));
  const buildingNames = new Map(pack.buildings.map((building) => [building.id, building.name]));
  const buildings = Object.entries(summary.buildings)
    .map(([id, count]) => ({ id, name: buildingNames.get(id) ?? id, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return {
    machines: buildings.reduce((total, building) => total + building.count, 0),
    buildings,
    raw: largest(
      Object.entries(summary.raw).map(([id, perSecond]) => {
        const limit = limits.get(id);
        return {
          item: item(id),
          perSecond,
          ...(limit !== undefined && { limitPerSecond: toPerSecond(limit, pack.units.rate) }),
        };
      }),
    ),
    byproducts: rates(summary.byproducts),
    shortfalls: rates(summary.shortfalls),
  };
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
