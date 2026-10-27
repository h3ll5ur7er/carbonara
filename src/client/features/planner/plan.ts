// The goal planner's rules in the client: goals in the document's unit become targets per second (and back), a
// proposal becomes a ghost, and its undo step gets a name.
import type { Graph } from "../../../contracts/document";
import type { PlanTarget, Proposal } from "../../../contracts/managers";
import type { Id, Item, PackData, RateUnit } from "../../../contracts/pack";
import { clean } from "../../../utilities/numbers";
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
