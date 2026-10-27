// What the inspector shows for a node, and the edit its production control makes. The production settings
// (a recipe's machine count, a sink's target, a source's limit) belong to every node of their kind; the pack
// plugin's fields, its derived metrics and its warnings come on top, from the plugin's description.
import type { CommandInput } from "../../../contracts/commands";
import type { Document, Node } from "../../../contracts/document";
import type { PackData, RateUnit } from "../../../contracts/pack";
import type { FieldValue, PluginDescription } from "../../../contracts/plugin";
import type { AnalysisResults } from "../../../contracts/results";
import { clean, formatMachines, formatNumber } from "../../../utilities/numbers";
import { own } from "../../../utilities/records";
import { fromPerSecond, rateSuffix, toPerSecond } from "../../../utilities/units";
import { boundaryPorts, type ItemView } from "../../canvas/model/scene";
import { instancesOf } from "../../features/subgraphs/path";
import { balanceMachines, type Balance } from "./balance";
import type { InspectedNode, InstanceDetails } from "./inspector";

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
  /**
   * The whole document when `document` is scoped to a blueprint (`scopedTo`), so that instances are counted in
   * every graph; `document` itself when left out.
   */
  factory?: Document | undefined;
}

const rateUnitOf = (document: Document, pack: PackData): RateUnit => document.settings.rateUnit ?? pack.units.rate;

export function inspectNode({
  document,
  pack,
  results,
  nodeId,
  plugin,
  factory = document,
}: InspectInput): InspectedNode | null {
  const node = document.graph.nodes[nodeId];
  if (!node) return null;
  const unit = rateUnitOf(document, pack);
  const activity = results?.nodes[nodeId]?.activity;
  const base = { fields: {}, values: {} };
  const problems = (results?.diagnostics ?? []).flatMap((diagnostic) =>
    (diagnostic.kind === "warning" || diagnostic.kind === "error") && diagnostic.node === nodeId
      ? [{ kind: diagnostic.kind, message: diagnostic.message }]
      : [],
  );

  switch (node.kind) {
    case "recipe": {
      const recipe = pack.recipes.find((candidate) => candidate.id === node.recipe);
      const buildingId = node.building ?? recipe?.buildings[0];
      const building = pack.buildings.find((candidate) => candidate.id === buildingId);
      const groupsAs = document.settings.machineGroups ?? "fill";
      const running = activity !== undefined && clean(activity) > 0 ? ` · ${formatMachines(activity, groupsAs)}` : "";
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
        problems,
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
    case "instance": {
      const instance = instanceDetails(factory, pack, results, nodeId, node.blueprint, document.graph, unit);
      const placed = instancesOf(factory, node.blueprint);
      return {
        ...base,
        title: instance.name,
        subtitle: `Subgraph · placed ${placed === 1 ? "once" : `${placed} times`}`,
        problems,
        instance,
      };
    }
    default:
      return { ...base, title: KIND_TITLES[node.kind] };
  }
}

/**
 * An instance's blueprint, its scale and what crosses its ports (by item, as its card shows it), and the
 * instances of the same blueprint in the graph on screen.
 */
function instanceDetails(
  factory: Document,
  pack: PackData,
  results: AnalysisResults | null | undefined,
  nodeId: string,
  blueprintId: string,
  shown: Document["graph"],
  rateUnit: RateUnit,
): InstanceDetails {
  const blueprint = own(factory.blueprints, blueprintId);
  const result = results ? own(results.nodes, nodeId) : undefined;
  const itemView = (id: string): ItemView => {
    const item = pack.items.find((candidate) => candidate.id === id);
    return { id, name: item?.name ?? id, form: item?.form ?? "solid" };
  };
  const ports = (["in", "out"] as const).flatMap((direction) =>
    boundaryPorts(blueprint, own(factory.layout, blueprintId), direction).map(({ portId, node }) => ({
      port: portId,
      direction,
      item: itemView(node.item),
      perSecond: result && own(direction === "in" ? result.inputs : result.outputs, node.item),
    })),
  );
  return {
    blueprint: blueprintId,
    name: blueprint?.name ?? blueprintId,
    rateUnit,
    scale: result && result.activity > 0 ? result.activity : undefined,
    solved: result !== undefined,
    ports,
    siblings: Object.entries(shown.nodes).flatMap(([id, other]) =>
      other.kind === "instance" && other.blueprint === blueprintId ? [id] : [],
    ),
  };
}

export interface InspectSelectionInput extends Omit<InspectInput, "nodeId"> {
  /** Two or more selected nodes. */
  nodeIds: string[];
}

/**
 * Several selected nodes: the plugin fields every one of them has (same key, same descriptor), with the value
 * they share, or marked mixed where they differ. Only machines have fields, so a selection with anything else
 * has none to set.
 */
export function inspectSelection({ document, pack, nodeIds, plugin }: InspectSelectionInput): InspectedNode | null {
  const nodes = nodeIds.flatMap((id) => {
    const node = document.graph.nodes[id];
    return node ? [node] : [];
  });
  if (nodes.length === 0) return null;
  const machines = nodes.flatMap((node) => (node.kind === "recipe" ? [node] : []));
  const allMachines = machines.length === nodes.length;
  const buildingOf = (node: (typeof machines)[number]) =>
    node.building ?? pack.recipes.find((recipe) => recipe.id === node.recipe)?.buildings[0] ?? "";

  const counts = new Map<string, number>();
  for (const node of machines) counts.set(buildingOf(node), (counts.get(buildingOf(node)) ?? 0) + 1);
  const buildingName = (id: string) => pack.buildings.find((building) => building.id === id)?.name ?? id;
  const subtitle = [...counts].map(([id, count]) => `${count} × ${buildingName(id)}`).join(" · ");

  const descriptors = machines.map((node) => plugin?.nodeFields[buildingOf(node)] ?? {});
  const [first = {}] = descriptors;
  const fields = allMachines
    ? Object.fromEntries(
        Object.entries(first).filter(([key, descriptor]) =>
          descriptors.every((own) => own[key] && JSON.stringify(own[key]) === JSON.stringify(descriptor)),
        ),
      )
    : {};
  const values: Record<string, FieldValue> = {};
  const mixed: string[] = [];
  for (const key of Object.keys(fields)) {
    const seen = new Set(machines.map((node) => JSON.stringify(node.fields?.[key] ?? null)));
    const [only] = machines.map((node) => node.fields?.[key]);
    if (seen.size > 1) mixed.push(key);
    else if (only !== undefined) values[key] = only;
  }
  return {
    title: `${nodes.length} ${allMachines ? "machines" : "nodes"}`,
    ...(subtitle && { subtitle }),
    fields,
    values,
    mixed,
  };
}

const KIND_TITLES: Record<Exclude<Node["kind"], "recipe" | "source" | "sink" | "instance">, string> = {
  junction: "Junction",
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
