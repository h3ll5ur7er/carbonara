// Turns a document, its pack's data and the pack's plugin into the solver IR. Hides how game concepts
// (recipes, buildings, belts, pins, rate units) map onto activities and rates (docs/Architecture/Solver.md).
// Pure and deterministic: the same document gives byte-identical IR, whatever order its maps were built in.
// Incremental: given the memo of the document's last compile, it recompiles only the nodes and edges whose
// objects changed (documents are immutable, so an unchanged node keeps its object) and reuses the model
// objects of everything else, so the solver can tell what changed by identity.
import type { Document, Edge, Graph, LocalId, Node } from "../../contracts/document";
import type { Id, PackData } from "../../contracts/pack";
import type { NodeContext, Plugin, PluginContext } from "../../contracts/plugin";
import type { Diagnostic } from "../../contracts/results";
import type { Constraint, Model, ModelEdge, ModelNode } from "../../contracts/solver";
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
 * last compile, only what changed is compiled again; the result is the same as without it.
 */
export function compile({ document, pack, plugin }: CompileInput, memo: CompileMemo = compileMemo()): Compiled {
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
    if (!found) memo.graphs.set(name, (found = { nodes: new Map(), edges: new Map(), uses: new Map() }));
    return found;
  };
  const drafted = graphs.map((graph) =>
    draftGraph(graph, graphMemo(graph.name), { pack, plugin, context: context.context, lookups }),
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
function draftGraph(scope: GraphScope, memo: GraphMemo, { pack, plugin, context, lookups }: DraftInputs): Drafted {
  const { nodes, edges } = scope.graph;
  const { items, recipes, buildings, logistics } = lookups;
  // Most graphs don't change at all between compiles (a blueprint while the root graph is edited).
  if (memo.drafted && memo.graph === scope.graph && memo.placeable === scope.blueprints) return memo.drafted;
  // Forgotten until the graph is drafted: if a plugin hook throws, the next compile drafts it all again.
  const previous = memo.drafted;
  memo.drafted = undefined;
  let changed = !previous;

  /** Counts the items a draft or kept edge uses in or out of the graph's items. */
  const count = (used: Iterable<Id>, by: number) => {
    for (const item of used) memo.uses.set(item, (memo.uses.get(item) ?? 0) + by);
  };
  const draftItems = (known: NodeMemo | undefined) =>
    known?.compiling?.ok ? known.compiling.draft.rates.map((rate) => rate.item) : [];

  const nodeOrder = (memo.nodeOrder = ordered(nodes, memo.nodeOrder));
  const inModel: NodeMemo[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const id of nodeOrder.sorted) {
    const node = nodes[id] as Node;
    const placed = node.kind === "instance" ? placement(node.blueprint) : undefined;
    let known = memo.nodes.get(id);
    if (!known || known.node !== node || known.placed !== placed) {
      count(draftItems(known), -1);
      const nodeDiagnostics: Diagnostic[] = [];
      const compiling = compileNode(id, node, nodeDiagnostics);
      if (compiling?.problem !== undefined)
        nodeDiagnostics.push({ kind: "error", node: id, message: compiling.problem });
      known = { node, placed, compiling, diagnostics: nodeDiagnostics, index: -1 };
      count(draftItems(known), 1);
      memo.nodes.set(id, known);
      changed = true;
    }
    if (known.diagnostics.length > 0) diagnostics.push(...known.diagnostics);
    known.index = known.compiling?.ok ? inModel.push(known) - 1 : -1;
  }
  if (memo.nodes.size > nodeOrder.sorted.length) {
    for (const [id, known] of memo.nodes) {
      if (id in nodes) continue;
      count(draftItems(known), -1);
      memo.nodes.delete(id);
    }
    changed = true;
  }

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

  const edgeOrder = (memo.edgeOrder = ordered(edges, memo.edgeOrder));
  const kept: EdgeMemo[] = [];
  for (const id of edgeOrder.sorted) {
    const edge = edges[id] as Edge;
    const fromMemo = memo.nodes.get(edge.from);
    const toMemo = memo.nodes.get(edge.to);
    let known = memo.edges.get(id);
    if (!known || known.edge !== edge || known.fromMemo !== fromMemo || known.toMemo !== toMemo) {
      if (known?.kept) count([known.kept.item], -1);
      const edgeDiagnostics: Diagnostic[] = [];
      const kept = compileEdge(id, edge, edgeDiagnostics);
      // Its model object stays, to be reused if the edge comes out the same.
      const model = known?.model && { model: known.model, numbering: known.numbering as Id[] };
      known = { edge, fromMemo, toMemo, kept, diagnostics: edgeDiagnostics, ...model };
      if (known.kept) count([known.kept.item], 1);
      memo.edges.set(id, known);
      changed = true;
    }
    if (known.diagnostics.length > 0) diagnostics.push(...known.diagnostics);
    if (known.kept) kept.push(known);
  }
  if (memo.edges.size > edgeOrder.sorted.length) {
    for (const [id, known] of memo.edges) {
      if (id in edges) continue;
      if (known.kept) count([known.kept.item], -1);
      memo.edges.delete(id);
    }
    changed = true;
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
  if (!changed && previous) return (memo.drafted = previous);
  memo.drafted = { nodes: inModel, edges: kept, diagnostics, unchanged: true };
  return { ...memo.drafted, unchanged: false };
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

  const nodes = drafted.nodes.map((known): ModelNode => {
    if (known.model && known.numbering === items) return known.model;
    const draft = (known.compiling as { draft: Draft }).draft;
    known.numbering = items;
    return (known.model = {
      kind: draft.kind,
      rates: draft.rates.map((rate) => ({ item: index(rate.item), perSecond: rate.perSecond })),
      ...(draft.max !== undefined && { max: draft.max }),
      ...(draft.pin !== undefined && { pin: draft.pin }),
      cost: draft.cost,
      ...(draft.blueprint !== undefined && { blueprint: draft.blueprint }),
    });
  });

  const edges = drafted.edges.map((known): ModelEdge => {
    const edge = known.kept as Kept;
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

  const drafts = drafted.nodes.map((known) => (known.compiling as { draft: Draft }).draft);
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
    nodes: drafts.map((draft) => draft.id),
    edges: drafted.edges.map((edge) => (edge.kept as Kept).id),
    items,
    info: drafts.map((draft) => draft.info),
    context,
    diagnostics: [...settingsDiagnostics, ...drafted.diagnostics, ...plugged.diagnostics],
  };
  memo.compiled = compiled;
  return compiled;
}

/** A record's ids, sorted; the last sort is reused while the ids are the same, in the same order. */
function ordered(record: Record<string, unknown>, previous: Order | undefined): Order {
  const keys = Object.keys(record);
  if (previous && previous.keys.length === keys.length && keys.every((key, at) => previous.keys[at] === key)) {
    return previous;
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
