// Turns a document, its pack's data and the pack's plugin into the solver IR. Hides how game concepts
// (recipes, buildings, belts, pins, rate units) map onto activities and rates (docs/Architecture/Solver.md).
// Pure and deterministic: the same document gives byte-identical IR, whatever order its maps were built in.
// Incremental: given the memo of the document's last compile, it recompiles only the nodes and edges whose
// objects changed (documents are immutable, so an unchanged node keeps its object) and reuses the model
// objects of everything else, so the solver can tell what changed by identity.
import type { Document, Edge, Graph, LocalId, Node } from "../../contracts/document";
import type { Id, PackData } from "../../contracts/pack";
import type { Patch } from "../../contracts/patches";
import type { NodeContext, Plugin, PluginContext } from "../../contracts/plugin";
import type { Diagnostic } from "../../contracts/results";
import type { Constraint, Model, ModelEdge, ModelNode } from "../../contracts/solver";
import { own } from "../../utilities/records";
import { toPerSecond } from "../../utilities/units";
import { pluginConstraints, pluginContext, prepareRecipeNode } from "./hooks";
import {
  blueprintScope,
  compileInstance,
  compilePort,
  connectPorts,
  type BlueprintScope,
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

/** A node that isn't compiled has a problem, unless the plugin's hooks reported it already. */
export type Compiling = { ok: true; draft: Draft; problem?: string } | { ok: false; problem?: string };

/**
 * What the last compile of a document remembers for the next one. Opaque to callers: create one with
 * `compileMemo()`, keep it with the document, and pass it to every compile of that document.
 */
export interface CompileMemo {
  inputs?: { pack: PackData; plugin: Plugin; settings: unknown };
  context?: { context: PluginContext; diagnostics: Diagnostic[] };
  lookups?: Lookups | undefined;
  scope?: BlueprintScope | undefined;
  /** The numbering of items the remembered model objects use. */
  items?: Id[] | undefined;
  graphs: Map<string, GraphMemo>;
}

export function compileMemo(): CompileMemo {
  return { graphs: new Map() };
}

/** A graph as compiled last time: its nodes and edges by id, with the objects they were compiled from. */
interface GraphMemo {
  graph?: Graph;
  /** The blueprints its instances could place. */
  placeable?: GraphScope["blueprints"];
  nodeOrder?: Order;
  edgeOrder?: Order;
  nodes: Map<LocalId, NodeMemo>;
  edges: Map<LocalId, EdgeMemo>;
  /** The edges that name each node id as an end (whether it exists or not). */
  incident: Map<LocalId, Set<LocalId>>;
  /** How many of its drafts and kept edges use each item. */
  uses: Map<Id, number>;
  drafted?: Drafted | undefined;
  constraints?: {
    recipes: Draft[];
    at: number[];
    plugged: { constraints: Constraint[]; diagnostics: Diagnostic[] };
  };
  compiled?: Compiled | undefined;
  /** Blueprint graphs: the compiled blueprint and its entry in `model.blueprints`. */
  placed?: { body: Compiled; compiled: Compiled; entry: NonNullable<Model["blueprints"]>[number] };
}

/** Ids as `Object.keys` gave them, and sorted: sorting 50k ids takes longer than everything else. */
interface Order {
  keys: string[];
  sorted: string[];
}

interface NodeMemo {
  node: Node;
  /** Instances: the blueprint they place, as the scope had it. */
  placed: unknown;
  compiling: Compiling | undefined;
  diagnostics: Diagnostic[];
  /** Position in the model, in the latest compile; -1 when it isn't in the model. */
  index: number;
  model?: ModelNode;
  /** The numbering of items `model` uses. */
  numbering?: Id[];
}

interface EdgeMemo {
  edge: Edge;
  fromMemo: NodeMemo | undefined;
  toMemo: NodeMemo | undefined;
  kept: Kept | undefined;
  diagnostics: Diagnostic[];
  /** Position among the kept edges, in the latest compile; -1 when it isn't kept. */
  index: number;
  model?: ModelEdge;
  numbering?: Id[];
}

interface Kept {
  id: LocalId;
  from: NodeMemo;
  to: NodeMemo;
  item: Id;
  capacity?: number;
  ratio?: number;
  fromPort?: number;
  toPort?: number;
}

interface Lookups {
  items: Map<Id, number>;
  recipes: Map<Id, PackData["recipes"][number]>;
  buildings: Map<Id, PackData["buildings"][number]>;
  logistics: Map<Id, PackData["logistics"][number]>;
}

/** A graph's nodes and edges in model order, before items are numbered. */
interface Drafted {
  nodes: NodeMemo[];
  edges: EdgeMemo[];
  diagnostics: Diagnostic[];
  /** Nothing differs from the last compile. */
  unchanged: boolean;
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Compiles a document's root graph, with the blueprints its instances place. With the memo of the document's
 * last compile, only what changed is compiled again; the result is the same as without it. With `patches` that
 * turn the document of the memo's last compile into this one, only what they touch is even looked at.
 */
export function compile(input: CompileInput, memo: CompileMemo = compileMemo(), patches?: Patch[]): Compiled {
  try {
    return compileWith(input, memo, patches && touchedBy(patches));
  } catch (error) {
    // A plugin hook threw: the memo may be part old, part new, and the next patches wouldn't fit it.
    memo.graphs.clear();
    throw error;
  }
}

/** The nodes and edges of one graph that patches touched. */
interface Touched {
  nodes: Set<LocalId>;
  edges: Set<LocalId>;
}

/** What patches touched, by graph (`root` or a blueprint id); "all" when they touched more than nodes and edges. */
type TouchedGraphs = Map<string, Touched | "all"> | "all";

/** The parts of the document that don't go into the IR. */
const UNCOMPILED = new Set(["layout", "name"]);

function touchedBy(patches: Patch[]): TouchedGraphs {
  const graphs = new Map<string, Touched | "all">();
  const touch = (graph: string, path: Patch["path"]) => {
    const [list, id] = path;
    const known = graphs.get(graph) ?? { nodes: new Set<LocalId>(), edges: new Set<LocalId>() };
    if (known === "all" || id === undefined || (list !== "nodes" && list !== "edges")) graphs.set(graph, "all");
    else {
      known[list].add(String(id));
      graphs.set(graph, known);
    }
  };
  for (const { path } of patches) {
    const [top, blueprint, part, ...rest] = path;
    if (typeof top === "string" && UNCOMPILED.has(top)) continue;
    if (top === "graph") touch("root", path.slice(1));
    else if (top === "blueprints" && blueprint !== undefined && part === "graph") touch(String(blueprint), rest);
    // The scope of blueprints is compared as a whole anyway; their graphs aren't touched.
    else if (top === "blueprints" && blueprint !== undefined && part === "name" && rest.length === 0) continue;
    else if (top === "blueprints" && blueprint !== undefined) graphs.set(String(blueprint), "all");
    else return "all";
  }
  return graphs;
}

const NOTHING: Touched = { nodes: new Set(), edges: new Set() };

function compileWith({ document, pack, plugin }: CompileInput, memo: CompileMemo, touched?: TouchedGraphs): Compiled {
  const settings = document.settings.plugin;
  const inputs = memo.inputs;
  if (!inputs || inputs.pack !== pack || inputs.plugin !== plugin || inputs.settings !== settings) {
    // The plugin's answers depend on all three: nothing compiled before can be reused.
    memo.inputs = { pack, plugin, settings };
    memo.context = pluginContext(pack, plugin, settings);
    if (inputs?.pack !== pack) memo.lookups = undefined;
    memo.scope = undefined;
    memo.items = undefined;
    memo.graphs.clear();
  }
  const context = memo.context as NonNullable<CompileMemo["context"]>;
  const lookups = (memo.lookups ??= {
    items: new Map(pack.items.map((item, index) => [item.id, index])),
    recipes: new Map(pack.recipes.map((recipe) => [recipe.id, recipe])),
    buildings: new Map(pack.buildings.map((building) => [building.id, building])),
    logistics: new Map(pack.logistics.map((entry) => [entry.id, entry])),
  });
  const scope = (memo.scope = blueprintScope(document.blueprints, lookups.items, memo.scope));
  const graphs: GraphScope[] = [document.graph, ...scope.ids.map((id) => document.blueprints[id]?.graph as Graph)].map(
    (graph, index) => ({
      name: index === 0 ? "root" : (scope.ids[index - 1] as LocalId),
      graph,
      inBlueprint: index > 0,
      blueprints: scope.blueprints,
      cyclic: scope.cyclic,
    }),
  );
  for (const name of memo.graphs.keys()) if (!graphs.some((graph) => graph.name === name)) memo.graphs.delete(name);
  const graphMemo = (name: string): GraphMemo => {
    let found = memo.graphs.get(name);
    if (!found) {
      found = { nodes: new Map(), edges: new Map(), incident: new Map(), uses: new Map() };
      memo.graphs.set(name, found);
    }
    return found;
  };
  const hint = (graph: string): Touched | undefined => {
    if (touched === undefined || touched === "all") return undefined;
    const found = touched.get(graph) ?? NOTHING;
    return found === "all" ? undefined : found;
  };
  const drafted = graphs.map((graph) =>
    draftGraph(graph, graphMemo(graph.name), { pack, plugin, context: context.context, lookups }, hint(graph.name)),
  );

  // One numbering of items for all graphs, in pack order, so adding a node doesn't renumber the others.
  const used = new Set<Id>();
  for (const graph of graphs) for (const [item, count] of graphMemo(graph.name).uses) if (count > 0) used.add(item);
  const items = [...used].sort((a, b) => (lookups.items.get(a) ?? 0) - (lookups.items.get(b) ?? 0));
  if (!sameItems(memo.items, items)) memo.items = items;
  const numbering = memo.items as Id[];

  const compiled = graphs.map((graph, index) =>
    assemble(document.id, graph, drafted[index] as Drafted, graphMemo(graph.name), {
      plugin,
      context: context.context,
      settingsDiagnostics: graph.name === "root" ? context.diagnostics : [],
      items: numbering,
    }),
  );
  const [root, ...bodies] = compiled as [Compiled, ...Compiled[]];
  if (bodies.length === 0) return root;
  const placed = bodies.map((body, index) => {
    const id = scope.ids[index] as LocalId;
    const known = graphMemo(id);
    const name = (document.blueprints[id] as { name: string }).name;
    if (known.placed?.body === body && known.placed.compiled.name === name) return known.placed;
    const ports = body.info.flatMap((info, at) => (info.kind === "port" ? [at] : []));
    const { model } = body;
    // The same objects while the blueprint's model is the same, so the solver sees it didn't change.
    const entry = { nodes: model.nodes, edges: model.edges, constraints: model.constraints, ports };
    known.placed = { body, compiled: { ...body, name, ports }, entry };
    return known.placed;
  });
  return {
    ...root,
    model: { ...root.model, blueprints: placed.map(({ entry }) => entry) },
    blueprints: placed.map(({ compiled: body }) => body),
  };
}

interface DraftInputs {
  pack: PackData;
  plugin: Plugin;
  context: PluginContext;
  lookups: Lookups;
}

/** Compiles a graph's nodes and edges into drafts, again only for those whose objects changed. */
function draftGraph(
  scope: GraphScope,
  memo: GraphMemo,
  { pack, plugin, context, lookups }: DraftInputs,
  touched: Touched | undefined,
): Drafted {
  const { nodes, edges } = scope.graph;
  const { items, recipes, buildings, logistics } = lookups;
  // Most graphs don't change at all between compiles (a blueprint while the root graph is edited).
  if (memo.drafted && memo.graph === scope.graph && memo.placeable === scope.blueprints) return memo.drafted;
  // Forgotten until the graph is drafted: if a plugin hook throws, the next compile drafts it all again.
  const previous = memo.drafted;
  memo.drafted = undefined;

  /** Counts the items a draft or kept edge uses in or out of the graph's items. */
  const count = (used: Iterable<Id>, by: number) => {
    for (const item of used) memo.uses.set(item, (memo.uses.get(item) ?? 0) + by);
  };
  const draftItems = (known: NodeMemo | undefined) =>
    known?.compiling?.ok ? known.compiling.draft.rates.map((rate) => rate.item) : [];

  /** Compiles a node again if its object (or the blueprint it places) changed. */
  function refreshNode(id: LocalId, node: Node): NodeMemo {
    const placed = node.kind === "instance" ? placement(node.blueprint) : undefined;
    const known = memo.nodes.get(id);
    if (known && known.node === node && known.placed === placed) return known;
    count(draftItems(known), -1);
    const nodeDiagnostics: Diagnostic[] = [];
    const compiling = compileNode(id, node, nodeDiagnostics);
    if (compiling?.problem !== undefined) nodeDiagnostics.push({ kind: "error", node: id, message: compiling.problem });
    const fresh: NodeMemo = { node, placed, compiling, diagnostics: nodeDiagnostics, index: known?.index ?? -1 };
    count(draftItems(fresh), 1);
    memo.nodes.set(id, fresh);
    return fresh;
  }

  function forgetNode(id: LocalId): void {
    count(draftItems(memo.nodes.get(id)), -1);
    memo.nodes.delete(id);
  }

  /** Compiles an edge again if its object or the memo of one of its ends changed. */
  function refreshEdge(id: LocalId, edge: Edge): EdgeMemo {
    const fromMemo = memo.nodes.get(edge.from);
    const toMemo = memo.nodes.get(edge.to);
    const known = memo.edges.get(id);
    if (known && known.edge === edge && known.fromMemo === fromMemo && known.toMemo === toMemo) return known;
    if (known) forgetEdge(id);
    const edgeDiagnostics: Diagnostic[] = [];
    const kept = compileEdge(id, edge, edgeDiagnostics);
    // Its model object stays, to be reused if the edge comes out the same.
    const model = known?.model && { model: known.model, numbering: known.numbering as Id[] };
    const fresh: EdgeMemo = {
      edge,
      fromMemo,
      toMemo,
      kept,
      diagnostics: edgeDiagnostics,
      index: known?.index ?? -1,
      ...model,
    };
    if (kept) count([kept.item], 1);
    for (const end of [edge.from, edge.to]) {
      const at = memo.incident.get(end);
      if (at) at.add(id);
      else memo.incident.set(end, new Set([id]));
    }
    memo.edges.set(id, fresh);
    return fresh;
  }

  function forgetEdge(id: LocalId): void {
    const known = memo.edges.get(id);
    if (!known) return;
    if (known.kept) count([known.kept.item], -1);
    for (const end of [known.edge.from, known.edge.to]) memo.incident.get(end)?.delete(id);
    memo.edges.delete(id);
  }

  /** The graph's nodes and edges in model order, and their diagnostics, from the memo. */
  function collect(): Omit<Drafted, "unchanged"> {
    const inModel: NodeMemo[] = [];
    const kept: EdgeMemo[] = [];
    const diagnostics: Diagnostic[] = [];
    for (const id of (memo.nodeOrder as Order).sorted) {
      const known = memo.nodes.get(id) as NodeMemo;
      if (known.diagnostics.length > 0) diagnostics.push(...known.diagnostics);
      known.index = known.compiling?.ok ? inModel.push(known) - 1 : -1;
    }
    for (const id of (memo.edgeOrder as Order).sorted) {
      const known = memo.edges.get(id) as EdgeMemo;
      if (known.diagnostics.length > 0) diagnostics.push(...known.diagnostics);
      known.index = known.kept ? kept.push(known) - 1 : -1;
    }
    return { nodes: inModel, edges: kept, diagnostics };
  }

  /** Every node and edge compared with the memo. */
  function scan(): Drafted | undefined {
    let changed = false;
    const nodeOrder = (memo.nodeOrder = ordered(nodes, memo.nodeOrder));
    for (const id of nodeOrder.sorted) {
      const known = memo.nodes.get(id);
      changed = refreshNode(id, nodes[id] as Node) !== known || changed;
    }
    if (memo.nodes.size > nodeOrder.sorted.length) {
      for (const id of [...memo.nodes.keys()]) if (!Object.hasOwn(nodes, id)) forgetNode(id);
      changed = true;
    }
    const edgeOrder = (memo.edgeOrder = ordered(edges, memo.edgeOrder));
    for (const id of edgeOrder.sorted) {
      const known = memo.edges.get(id);
      changed = refreshEdge(id, edges[id] as Edge) !== known || changed;
    }
    if (memo.edges.size > edgeOrder.sorted.length) {
      for (const id of [...memo.edges.keys()]) if (!Object.hasOwn(edges, id)) forgetEdge(id);
      changed = true;
    }
    return changed || !previous ? { ...collect(), unchanged: false } : undefined;
  }

  /**
   * Only the nodes and edges the document's patches touched, and the edges at those nodes. The rest is as the
   * last compile left it, so the lists of the last compile are patched where they can be.
   */
  function patch(touched: Touched, last: Drafted): Drafted | undefined {
    const nodeOrder = memo.nodeOrder as Order;
    const edgeOrder = memo.edgeOrder as Order;
    let [reshaped, diagnosed] = [false, false];
    const replacedNodes: NodeMemo[] = [];
    const replacedEdges: EdgeMemo[] = [];
    const edgeIds = new Set(touched.edges);
    for (const id of touched.nodes) {
      const before = memo.nodes.get(id);
      // Ids from patches may be anything, `constructor` included: own keys only.
      const node = own(nodes, id);
      if (node === undefined && !before) continue;
      const after = node === undefined ? undefined : refreshNode(id, node);
      if (after === before) continue;
      for (const edge of memo.incident.get(id) ?? []) edgeIds.add(edge);
      if (!after) {
        forgetNode(id);
        remove(nodeOrder, id);
      } else if (!before) insert(nodeOrder, id);
      diagnosed ||= (before?.diagnostics.length ?? 0) + (after?.diagnostics.length ?? 0) > 0;
      if (before?.compiling?.ok === after?.compiling?.ok && after?.compiling?.ok) replacedNodes.push(after);
      else reshaped = true;
    }
    for (const id of edgeIds) {
      const before = memo.edges.get(id);
      const edge = own(edges, id);
      if (edge === undefined && !before) continue;
      const after = edge === undefined ? undefined : refreshEdge(id, edge);
      if (after === before) continue;
      if (!after) {
        forgetEdge(id);
        remove(edgeOrder, id);
      } else if (!before) insert(edgeOrder, id);
      diagnosed ||= (before?.diagnostics.length ?? 0) + (after?.diagnostics.length ?? 0) > 0;
      if (before?.kept && after?.kept) replacedEdges.push(after);
      else if (before?.kept || after?.kept) reshaped = true;
    }
    if (!reshaped && !diagnosed && replacedNodes.length === 0 && replacedEdges.length === 0) return undefined;
    if (reshaped || diagnosed) return { ...collect(), unchanged: false };
    const inModel = last.nodes.slice();
    for (const known of replacedNodes) inModel[known.index] = known;
    const kept = last.edges.slice();
    for (const known of replacedEdges) kept[known.index] = known;
    return { nodes: inModel, edges: kept, diagnostics: last.diagnostics, unchanged: false };
  }

  // Patches that don't touch a graph whose object changed don't describe this change: look at everything.
  const described = touched && (touched.nodes.size > 0 || touched.edges.size > 0 || memo.graph === scope.graph);
  const fast = described && previous && memo.nodeOrder && memo.edgeOrder && memo.placeable === scope.blueprints;
  const drafted = fast ? patch(touched, previous) : scan();

  /** What an instance's draft depends on besides the node: the blueprint it places, as the scope has it. */
  function placement(blueprint: LocalId): unknown {
    return scope.cyclic.has(blueprint) ? "cyclic" : scope.blueprints.get(blueprint);
  }

  function compileNode(id: LocalId, node: Node, nodeDiagnostics: Diagnostic[]): Compiling | undefined {
    const unknownItem = (item: Id): Compiling => ({ ok: false, problem: `Unknown item "${item}"` });
    switch (node.kind) {
      case "recipe":
        return compileRecipe(id, node, nodeDiagnostics);
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

  function compileRecipe(
    id: LocalId,
    node: Extract<Node, { kind: "recipe" }>,
    nodeDiagnostics: Diagnostic[],
  ): Compiling {
    const recipe = recipes.get(node.recipe);
    if (!recipe) return { ok: false, problem: `Unknown recipe "${node.recipe}"` };
    const buildingId = node.building ?? (recipe.buildings[0] as Id);
    const building = buildings.get(buildingId);
    if (!building || !recipe.buildings.includes(buildingId)) {
      return { ok: false, problem: `Recipe "${recipe.id}" can't run in "${buildingId}"` };
    }
    const prepared = prepareRecipeNode(plugin, context, id, recipe, building, node.fields);
    nodeDiagnostics.push(...prepared.diagnostics);
    const { context: nodeContext, effective } = prepared;
    if (!effective) return { ok: false };
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

  function compileEdge(id: LocalId, edge: Edge, edgeDiagnostics: Diagnostic[]): Kept | undefined {
    const problem = (message: string, node?: LocalId) =>
      edgeDiagnostics.push({ kind: "error", message: `Edge "${id}" ${message}`, ...(node !== undefined && { node }) });
    const ends = [edge.from, edge.to];
    const missing = ends.find((end) => !memo.nodes.has(end));
    if (missing !== undefined) {
      problem(`connects "${missing}", which doesn't exist`);
      return undefined;
    }
    const itemless = ends.find((end) => ["note", "frame"].includes((memo.nodes.get(end) as NodeMemo).node.kind));
    if (itemless !== undefined) {
      problem(`connects "${itemless}", which carries no items`);
      return undefined;
    }
    const fromMemo = memo.nodes.get(edge.from) as NodeMemo;
    const toMemo = memo.nodes.get(edge.to) as NodeMemo;
    // A node that didn't compile has its diagnostic already.
    if (!fromMemo.compiling?.ok || !toMemo.compiling?.ok) return undefined;
    const [from, to] = [fromMemo.compiling.draft, toMemo.compiling.draft];
    if (!items.has(edge.item)) {
      problem(`carries unknown item "${edge.item}"`);
      return undefined;
    }
    const ports = connectPorts(edge, from, to);
    if (typeof ports === "string") {
      problem(ports);
      return undefined;
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
    return {
      id,
      from: fromMemo,
      to: toMemo,
      item: edge.item,
      ...(capacity !== undefined && { capacity }),
      ...(edge.ratio !== undefined && { ratio: edge.ratio }),
      ...ports,
    };
  }

  memo.graph = scope.graph;
  memo.placeable = scope.blueprints;
  if (!drafted) return (memo.drafted = previous as Drafted);
  memo.drafted = { ...drafted, unchanged: true };
  return drafted;
}

interface AssembleInputs {
  plugin: Plugin;
  context: PluginContext;
  settingsDiagnostics: Diagnostic[];
  items: Id[];
}

/** A graph's model with the shared numbering of items, reusing the model objects of what didn't change. */
function assemble(
  documentId: string,
  scope: GraphScope,
  drafted: Drafted,
  memo: GraphMemo,
  { plugin, context, settingsDiagnostics, items }: AssembleInputs,
): Compiled {
  const previous = memo.compiled;
  if (drafted.unchanged && previous && previous.items === items && previous.documentId === documentId) return previous;
  let itemIndex: Map<Id, number> | undefined;
  const index = (item: Id) => (itemIndex ??= new Map(items.map((id, at) => [id, at]))).get(item) as number;

  // One pass per list: these run over every node and edge of large documents.
  const count = drafted.nodes.length;
  const [nodes, ids, info, drafts]: [ModelNode[], LocalId[], NodeInfo[], Draft[]] = [[], [], [], []];
  for (let at = 0; at < count; at++) {
    const known = drafted.nodes[at] as NodeMemo;
    const draft = (known.compiling as { draft: Draft }).draft;
    if (!known.model || known.numbering !== items) {
      known.numbering = items;
      known.model = {
        kind: draft.kind,
        rates: draft.rates.map((rate) => ({ item: index(rate.item), perSecond: rate.perSecond })),
        ...(draft.max !== undefined && { max: draft.max }),
        ...(draft.pin !== undefined && { pin: draft.pin }),
        cost: draft.cost,
        ...(draft.blueprint !== undefined && { blueprint: draft.blueprint }),
      };
    }
    nodes.push(known.model);
    ids.push(draft.id);
    info.push(draft.info);
    drafts.push(draft);
  }

  const edgeIds: LocalId[] = [];
  const edges = drafted.edges.map((known): ModelEdge => {
    const edge = known.kept as Kept;
    edgeIds.push(edge.id);
    const [from, to] = [edge.from.index, edge.to.index];
    const built = known.model;
    if (built && known.numbering === items && built.from === from && built.to === to) return built;
    const item = index(edge.item);
    known.numbering = items;
    // By value: an edge whose end was recompiled usually stays the same edge.
    if (
      built?.item === item &&
      built.from === from &&
      built.to === to &&
      built.capacity === edge.capacity &&
      built.ratio === edge.ratio &&
      built.fromPort === edge.fromPort &&
      built.toPort === edge.toPort
    ) {
      return built;
    }
    return (known.model = {
      from,
      to,
      item,
      ...(edge.capacity !== undefined && { capacity: edge.capacity }),
      ...(edge.ratio !== undefined && { ratio: edge.ratio }),
      ...(edge.fromPort !== undefined && { fromPort: edge.fromPort }),
      ...(edge.toPort !== undefined && { toPort: edge.toPort }),
    });
  });

  // The plugin's constraints depend on the recipe nodes only: ask again only when one of them changed.
  const recipes = plugin.constraints ? drafts.filter((draft) => draft.info.context) : [];
  const at = recipes.map((draft) => (memo.nodes.get(draft.id) as NodeMemo).index);
  const known = memo.constraints;
  let plugged = known?.plugged;
  if (!plugged || !known || !sameDrafts(known.recipes, recipes) || !sameNumbers(known.at, at)) {
    const recipeNodes = recipes.map((draft) => ({ id: draft.id, ...(draft.info.context as NodeContext) }));
    plugged = pluginConstraints(
      plugin,
      context,
      recipeNodes,
      new Map(recipes.map((draft, i) => [draft.id, at[i] as number])),
    );
    memo.constraints = { recipes, at, plugged };
  }

  const compiled: Compiled = {
    documentId,
    graph: scope.name,
    model: { items: items.length, nodes, edges, constraints: plugged.constraints },
    nodes: ids,
    edges: edgeIds,
    items,
    info,
    context,
    diagnostics: [...settingsDiagnostics, ...drafted.diagnostics, ...plugged.diagnostics],
  };
  memo.compiled = compiled;
  return compiled;
}

/** Adds an id to an order; `keys` no longer match `Object.keys`, so the next scan sorts again. */
function insert(order: Order, id: LocalId): void {
  order.keys = [];
  let [low, high] = [0, order.sorted.length];
  while (low < high) {
    const middle = (low + high) >> 1;
    if (byId(order.sorted[middle] as LocalId, id) < 0) low = middle + 1;
    else high = middle;
  }
  order.sorted.splice(low, 0, id);
}

function remove(order: Order, id: LocalId): void {
  order.keys = [];
  const at = order.sorted.indexOf(id);
  if (at >= 0) order.sorted.splice(at, 1);
}

/** A record's ids, sorted; the last sort is reused while the ids are the same, in the same order. */
function ordered(record: Record<string, unknown>, previous: Order | undefined): Order {
  const keys = Object.keys(record);
  if (previous?.keys.length === keys.length) {
    let same = true;
    for (let at = 0; same && at < keys.length; at++) same = previous.keys[at] === keys[at];
    if (same) return previous;
  }
  return { keys, sorted: [...keys].sort(byId) };
}

function sameItems(a: Id[] | undefined, b: Id[]): boolean {
  return a !== undefined && a.length === b.length && a.every((item, at) => b[at] === item);
}

function sameNumbers(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, at) => b[at] === value);
}

function sameDrafts(a: Draft[], b: Draft[]): boolean {
  return a.length === b.length && a.every((draft, at) => b[at] === draft);
}

function netRate(draft: Draft, item: Id): number {
  return draft.rates.filter((rate) => rate.item === item).reduce((sum, rate) => sum + rate.perSecond, 0);
}
