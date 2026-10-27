// What the inspector shows for a node, and the edit its production control makes. The production settings
// (a recipe's machine count, a sink's target, a source's limit) belong to every node of their kind; the pack
// plugin's fields, its derived metrics and its warnings come on top, from the plugin's description.
import type { CommandInput } from "../../../contracts/commands";
import type { Document, Node } from "../../../contracts/document";
import type { PackData, RateUnit } from "../../../contracts/pack";
import type { PluginDescription } from "../../../contracts/plugin";
import type { AnalysisResults } from "../../../contracts/results";
import { clean, formatMachines, formatNumber } from "../../../utilities/numbers";
import { fromPerSecond, rateSuffix, toPerSecond } from "../../../utilities/units";
import { balanceMachines, type Balance } from "./balance";
import type { InspectedNode } from "./inspector";

/** A recipe's machine count, a sink's target or a source's supply limit, in the units the user sees. */
export interface Production {
  kind: "machines" | "target" | "limit";
  label: string;
  /** "" for machines, the rate suffix (`/min`) for rates. */
  unit: string;
  /** What the user set; null when the solver chooses (machines), or there is no target or limit. */
  value: number | null;
  /** What the latest solve came to. */
  actual: number | undefined;
  /** Machines only: the counts that fit the neighbours (balance.ts). */
  fits?: Balance;
}

export interface InspectInput {
  document: Document;
  pack: PackData;
  results: AnalysisResults | null | undefined;
  nodeId: string;
  /** The pack plugin's fields and metrics; without it, recipe nodes show no plugin fields. */
  plugin?: PluginDescription | undefined;
}

const rateUnitOf = (document: Document, pack: PackData): RateUnit => document.settings.rateUnit ?? pack.units.rate;

export function inspectNode({ document, pack, results, nodeId, plugin }: InspectInput): InspectedNode | null {
  const node = document.graph.nodes[nodeId];
  if (!node) return null;
  const unit = rateUnitOf(document, pack);
  const activity = results?.nodes[nodeId]?.activity;
  const base = { fields: {}, values: {} };

  switch (node.kind) {
    case "recipe": {
      const recipe = pack.recipes.find((candidate) => candidate.id === node.recipe);
      const buildingId = node.building ?? recipe?.buildings[0];
      const building = pack.buildings.find((candidate) => candidate.id === buildingId);
      const running = activity !== undefined && clean(activity) > 0 ? ` · ${formatMachines(activity)}` : "";
      const derived = Object.entries(results?.nodes[nodeId]?.derived ?? {});
      return {
        fields: (buildingId && plugin?.nodeFields[buildingId]) || {},
        values: node.fields ?? {},
        metrics: derived.map(([key, value]) => {
          const metric = plugin?.metrics[key];
          return {
            label: metric?.label ?? key,
            value: `${formatNumber(value, 2)}${metric?.unit ? ` ${metric.unit}` : ""}`,
          };
        }),
        problems: (results?.diagnostics ?? []).flatMap((diagnostic) =>
          (diagnostic.kind === "warning" || diagnostic.kind === "error") && diagnostic.node === nodeId
            ? [{ kind: diagnostic.kind, message: diagnostic.message }]
            : [],
        ),
        title: recipeName(pack, node.recipe),
        subtitle: `${building?.name ?? buildingId ?? "Unknown building"}${running}`,
        production: {
          kind: "machines",
          label: "Machines",
          unit: "",
          value: node.pin?.type === "machines" ? node.pin.count : null,
          actual: activity,
          fits: balanceMachines(document, pack, results, nodeId),
        },
      };
    }
    case "source":
    case "sink": {
      const set = node.kind === "source" ? node.maxPerSecond : node.targetPerSecond;
      return {
        ...base,
        title: itemName(pack, node.item),
        subtitle: node.kind === "source" ? "Source" : "Output",
        production: {
          kind: node.kind === "source" ? "limit" : "target",
          label: node.kind === "source" ? "Supply limit" : "Target",
          unit: rateSuffix(unit),
          value: set === undefined ? null : clean(fromPerSecond(set, unit)),
          actual: activity === undefined ? undefined : clean(fromPerSecond(activity, unit)),
        },
      };
    }
    default:
      return { ...base, title: KIND_TITLES[node.kind] };
  }
}

const KIND_TITLES: Record<Exclude<Node["kind"], "recipe" | "source" | "sink">, string> = {
  junction: "Junction",
  instance: "Blueprint",
  port: "Port",
  note: "Note",
  frame: "Frame",
};

/** The commands and the history label for setting a node's production value (null clears it). */
export function productionEdit(
  document: Document,
  pack: PackData,
  nodeId: string,
  value: number | null,
): { commands: CommandInput[]; label: string } | null {
  const node = document.graph.nodes[nodeId];
  if (!node) return null;
  const unit = rateUnitOf(document, pack);
  if (node.kind === "recipe") {
    const name = recipeName(pack, node.recipe);
    return {
      commands: [
        { type: "setPin", graph: "root", id: nodeId, pin: value === null ? null : { type: "machines", count: value } },
      ],
      label:
        value === null
          ? `Let the solver choose ${name} machines`
          : `Set ${name} to ${formatNumber(value)} machine${value === 1 ? "" : "s"}`,
    };
  }
  if (node.kind === "source" || node.kind === "sink") {
    const name = itemName(pack, node.item);
    const what = node.kind === "source" ? "supply limit" : "target";
    return {
      commands: [
        { type: "setRate", graph: "root", id: nodeId, perSecond: value === null ? null : toPerSecond(value, unit) },
      ],
      label:
        value === null ? `Remove ${name} ${what}` : `Set ${name} ${what} to ${formatNumber(value)}${rateSuffix(unit)}`,
    };
  }
  return null;
}

function recipeName(pack: PackData, recipeId: string): string {
  const recipe = pack.recipes.find((candidate) => candidate.id === recipeId);
  if (recipe?.name) return recipe.name;
  const [main] = Object.keys(recipe?.out ?? {});
  return main ? itemName(pack, main) : recipeId;
}

function itemName(pack: PackData, itemId: string): string {
  return pack.items.find((item) => item.id === itemId)?.name ?? itemId;
}
