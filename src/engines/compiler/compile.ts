// Turns a document, its pack's data and the pack's plugin into the solver IR. Hides how game concepts
// (recipes, buildings, belts, pins, rate units) map onto activities and rates (docs/Architecture/Solver.md).
// Pure and deterministic: the same document gives byte-identical IR, whatever order its maps were built in.
import type { Document, LocalId, Node } from "../../contracts/document";
import type { Building, Id, PackData, Recipe } from "../../contracts/pack";
import type { FieldValue, NodeContext, Plugin, PluginContext } from "../../contracts/plugin";
import type { Diagnostic } from "../../contracts/results";
import type { Model, ModelEdge, ModelNode } from "../../contracts/solver";
import { toPerSecond } from "../../utilities/units";
import {
  compileInstance,
  compilePort,
  compileWithBlueprints,
  connectPorts,
  type GraphScope,
  type Port,
} from "./instances";

export interface CompileInput {
  document: Document;
  pack: PackData;
  plugin: Plugin;
}

/** What `toResults` needs to know about a model node besides its index. */
export interface NodeInfo {
  kind: "recipe" | "source" | "sink" | "junction" | "instance" | "port";
  /** Recipe nodes: what the plugin's `derive` hook gets. */
  context?: NodeContext;
  /** Rate-pinned recipes: the pinned item per machine and second, to report misses in items per second. */
  pinRate?: number;
  /** Instance nodes: their blueprint's index in `Compiled.blueprints`, and its ports by index. */
  blueprint?: number;
  ports?: Port[];
}

export interface Compiled {
  documentId: string;
  /** `root` or a blueprint id. */
  graph: string;
  /** The root graph's model holds the blueprints' models too (`model.blueprints`). */
  model: Model;
  /** Document ids of the model's nodes, edges and items, by index. */
  nodes: LocalId[];
  edges: LocalId[];
  items: Id[];
  info: NodeInfo[];
  context: PluginContext;
  /** What couldn't be compiled; those parts are left out of the model. */
  diagnostics: Diagnostic[];
  /** Blueprint graphs: the blueprint's name and its port nodes (indices into `nodes`), by port index. */
  name?: string;
  ports?: number[];
  /** The root graph of a document with blueprints: each blueprint compiled, by index in `model.blueprints`. */
  blueprints?: Compiled[];
}

/** A model node whose rates still name items by id. */
export interface Draft {
  id: LocalId;
  kind: ModelNode["kind"];
  rates: { item: Id; perSecond: number }[];
  max?: number;
  pin?: number;
  cost: number;
  blueprint?: number;
  info: NodeInfo;
}

export type Compiling = { ok: true; draft: Draft; problem?: string } | { ok: false; problem: string };

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Compiles a document's root graph, with the blueprints its instances place. */
export function compile(input: CompileInput): Compiled {
  return compileWithBlueprints(input, compileGraph);
}

function compileGraph({ document, pack, plugin }: CompileInput, scope: GraphScope): Compiled {
  const context: PluginContext = { pack, settings: document.settings.plugin ?? {} };
  const items = new Map(pack.items.map((item, index) => [item.id, index]));
  const recipes = new Map(pack.recipes.map((recipe) => [recipe.id, recipe]));
  const buildings = new Map(pack.buildings.map((building) => [building.id, building]));
  const logistics = new Map(pack.logistics.map((entry) => [entry.id, entry]));
  const { nodes, edges } = scope.graph;

  const nodeDiagnostics: Diagnostic[] = [];
  const drafts = new Map<LocalId, Draft>();
  for (const id of Object.keys(nodes).sort(byId)) {
    const node = nodes[id] as Node;
    const result = compileNode(id, node);
    if (result === undefined) continue;
    if (result.problem !== undefined) nodeDiagnostics.push({ kind: "error", node: id, message: result.problem });
    if (result.ok) drafts.set(id, result.draft);
  }

  function compileNode(id: LocalId, node: Node): Compiling | undefined {
    const unknownItem = (item: Id): Compiling => ({ ok: false, problem: `Unknown item "${item}"` });
    switch (node.kind) {
      case "recipe":
        return compileRecipe(id, node);
      case "source":
        if (!items.has(node.item)) return unknownItem(node.item);
        return {
          ok: true,
          draft: {
            id,
            kind: "process",
            rates: [{ item: node.item, perSecond: 1 }],
            ...(node.maxPerSecond !== undefined && { max: node.maxPerSecond }),
            // Raw resources cost, so the solver uses as few as it can.
            cost: 1,
            info: { kind: "source" },
          },
        };
      case "sink":
        if (!items.has(node.item)) return unknownItem(node.item);
        return {
          ok: true,
          draft: {
            id,
            kind: "process",
            rates: [{ item: node.item, perSecond: -1 }],
            ...(node.targetPerSecond !== undefined && { pin: node.targetPerSecond }),
            cost: 0,
            info: { kind: "sink" },
          },
        };
      case "junction":
        return { ok: true, draft: { id, kind: "junction", rates: [], cost: 0, info: { kind: "junction" } } };
      case "instance":
        return compileInstance(id, node, scope);
      case "port":
        return compilePort(id, node, scope, items);
      case "note":
      case "frame":
        return undefined;
    }
  }

  function compileRecipe(id: LocalId, node: Extract<Node, { kind: "recipe" }>): Compiling {
    const recipe = recipes.get(node.recipe);
    if (!recipe) return { ok: false, problem: `Unknown recipe "${node.recipe}"` };
    const buildingId = node.building ?? (recipe.buildings[0] as Id);
    const building = buildings.get(buildingId);
    if (!building || !recipe.buildings.includes(buildingId)) {
      return { ok: false, problem: `Recipe "${recipe.id}" can't run in "${buildingId}"` };
    }
    const nodeContext: NodeContext = { recipe, building, fields: fieldsOf(node, building) };
    const effective = plugin.effectiveRecipe?.(nodeContext, context) ?? asRunBy(recipe);
    const unknown = [...Object.keys(effective.in), ...Object.keys(effective.out)].find((item) => !items.has(item));
    if (unknown !== undefined) return { ok: false, problem: `Unknown item "${unknown}"` };

    // Items per second per machine: amount / (time / speed).
    const perCraft = building.speed / effective.time;
    const side = (amounts: Record<Id, number>, sign: number) =>
      Object.keys(amounts)
        .sort((a, b) => (items.get(a) ?? 0) - (items.get(b) ?? 0))
        .map((item) => ({ item, perSecond: sign * (amounts[item] as number) * perCraft }));
    const draft: Draft = {
      id,
      kind: "process",
      rates: [...side(effective.in, -1), ...side(effective.out, 1)],
      cost: 0,
      info: { kind: "recipe", context: nodeContext },
    };
    if (node.pin?.type === "machines") draft.pin = node.pin.count;
    if (node.pin?.type === "rate") {
      const pinned = node.pin.item;
      const net = Math.abs(
        draft.rates.filter((rate) => rate.item === pinned).reduce((sum, rate) => sum + rate.perSecond, 0),
      );
      if (net === 0) {
        return { ok: true, draft, problem: `The pin is ignored: the recipe neither makes nor uses "${pinned}"` };
      }
      draft.pin = node.pin.perSecond / net;
      draft.info.pinRate = net;
    }
    return { ok: true, draft };
  }

  function fieldsOf(node: Extract<Node, { kind: "recipe" }>, building: Building): Record<string, FieldValue> {
    const descriptors = plugin.nodeFields?.(building, context) ?? {};
    const defaults = Object.fromEntries(Object.entries(descriptors).map(([name, field]) => [name, field.default]));
    return { ...defaults, ...node.fields };
  }

  const edgeDiagnostics: Diagnostic[] = [];
  const kept: {
    id: LocalId;
    from: Draft;
    to: Draft;
    item: Id;
    capacity?: number;
    ratio?: number;
    fromPort?: number;
    toPort?: number;
  }[] = [];
  for (const id of Object.keys(edges).sort(byId)) {
    const edge = edges[id] as (typeof edges)[string];
    const problem = (message: string, node?: LocalId) =>
      edgeDiagnostics.push({ kind: "error", message: `Edge "${id}" ${message}`, ...(node !== undefined && { node }) });
    const missing = [edge.from, edge.to].find((end) => !(end in nodes));
    if (missing !== undefined) {
      problem(`connects "${missing}", which doesn't exist`);
      continue;
    }
    const itemless = [edge.from, edge.to].find((end) => ["note", "frame"].includes((nodes[end] as Node).kind));
    if (itemless !== undefined) {
      problem(`connects "${itemless}", which carries no items`);
      continue;
    }
    const from = drafts.get(edge.from);
    const to = drafts.get(edge.to);
    // A node that didn't compile has its diagnostic already.
    if (!from || !to) continue;
    if (!items.has(edge.item)) {
      problem(`carries unknown item "${edge.item}"`);
      continue;
    }
    const ports = connectPorts(edge, from, to);
    if (typeof ports === "string") {
      problem(ports);
      continue;
    }
    let capacity: number | undefined;
    if (edge.logistics !== undefined) {
      const belt = logistics.get(edge.logistics);
      if (belt) capacity = toPerSecond(belt.capacity, pack.units.rate);
      else problem(`uses unknown belt or pipe "${edge.logistics}"`);
    }
    // The solver lets such an edge carry nothing; say why.
    if (from.kind === "process" && !(netRate(from, edge.item) > 0)) {
      problem(`carries "${edge.item}", which this node doesn't make`, from.id);
    } else if (to.kind === "process" && !(netRate(to, edge.item) < 0)) {
      problem(`carries "${edge.item}", which this node doesn't use`, to.id);
    }
    kept.push({
      id,
      from,
      to,
      item: edge.item,
      ...(capacity !== undefined && { capacity }),
      ...(edge.ratio !== undefined && { ratio: edge.ratio }),
      ...ports,
    });
  }

  // Items in pack order, so adding a node doesn't renumber the others.
  const used = new Set([...drafts.values()].flatMap((draft) => draft.rates.map((rate) => rate.item)));
  for (const edge of kept) used.add(edge.item);
  const itemIds = [...used].sort((a, b) => (items.get(a) ?? 0) - (items.get(b) ?? 0));
  const itemIndex = new Map(itemIds.map((item, index) => [item, index]));
  const index = (item: Id) => itemIndex.get(item) as number;
  const draftList = [...drafts.values()];
  const nodeIndex = new Map(draftList.map((draft, position) => [draft.id, position]));

  return {
    documentId: document.id,
    graph: scope.name,
    model: {
      items: itemIds.length,
      nodes: draftList.map((draft): ModelNode => ({
        kind: draft.kind,
        rates: draft.rates.map((rate) => ({ item: index(rate.item), perSecond: rate.perSecond })),
        ...(draft.max !== undefined && { max: draft.max }),
        ...(draft.pin !== undefined && { pin: draft.pin }),
        cost: draft.cost,
        ...(draft.blueprint !== undefined && { blueprint: draft.blueprint }),
      })),
      edges: kept.map((edge): ModelEdge => ({
        from: nodeIndex.get(edge.from.id) as number,
        to: nodeIndex.get(edge.to.id) as number,
        item: index(edge.item),
        ...(edge.capacity !== undefined && { capacity: edge.capacity }),
        ...(edge.ratio !== undefined && { ratio: edge.ratio }),
        ...(edge.fromPort !== undefined && { fromPort: edge.fromPort }),
        ...(edge.toPort !== undefined && { toPort: edge.toPort }),
      })),
      constraints: [],
    },
    nodes: draftList.map((draft) => draft.id),
    edges: kept.map((edge) => edge.id),
    items: itemIds,
    info: draftList.map((draft) => draft.info),
    context,
    diagnostics: [...nodeDiagnostics, ...edgeDiagnostics],
  };
}

/** The identity of the `effectiveRecipe` hook. */
function asRunBy(recipe: Recipe) {
  return { time: recipe.time, in: recipe.in, out: recipe.out };
}

function netRate(draft: Draft, item: Id): number {
  return draft.rates.filter((rate) => rate.item === item).reduce((sum, rate) => sum + rate.perSecond, 0);
}
