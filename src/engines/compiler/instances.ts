// Blueprints and their instances in the solver IR (docs/Architecture/Subgraphs.md). Every graph compiles
// the same way; this file adds what is special about subgraphs: which blueprints a graph can place, how
// instance and port nodes compile, how edges reach an instance through its ports, and how the graphs
// join into one model with one numbering of items. How blueprints are summarised is the solver's business.
import type { Blueprint, Document, Edge, Graph, LocalId, Node } from "../../contracts/document";
import type { Id } from "../../contracts/pack";
import type { Diagnostic } from "../../contracts/results";
import type { InstanceSolution, Solution } from "../../contracts/solver";
import { clean } from "../../utilities/numbers";
import type { CompileInput, Compiled, Compiling, Draft, NodeInfo } from "./compile";

/** A blueprint port as instances see it. */
export interface Port {
  /** The port node's id inside the blueprint. */
  id: LocalId;
  item: Id;
  /** An `in` port: the item enters the blueprint. */
  entering: boolean;
}

/** What a graph's compiler needs to know besides the graph itself. */
export interface GraphScope {
  /** `root` or a blueprint id. */
  name: string;
  graph: Graph;
  /** Port nodes belong in blueprints only. */
  inBlueprint: boolean;
  /** The blueprints instances can place, with their index in the model and their ports by index. */
  blueprints: Map<LocalId, { index: number; ports: Port[] }>;
  /** Blueprints that place themselves, directly or through others: their instances can't be solved. */
  cyclic: Set<LocalId>;
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A blueprint's ports, by port index: its port nodes of known items, by id. */
function portsOf(blueprint: Blueprint, items: Map<Id, number>): Port[] {
  const nodes = blueprint.graph.nodes;
  return Object.keys(nodes)
    .sort(byId)
    .flatMap((id) => {
      const node = nodes[id] as Node;
      if (node.kind !== "port" || !items.has(node.item)) return [];
      return [{ id, item: node.item, entering: node.direction === "in" }];
    });
}

/** Blueprints on a cycle of instances (the editing engine prevents them; files may still hold them). */
function cyclicBlueprints(blueprints: Document["blueprints"]): Set<LocalId> {
  const cyclic = new Set<LocalId>();
  const placed = (id: LocalId) =>
    Object.values(blueprints[id]?.graph.nodes ?? {}).flatMap((node) =>
      node.kind === "instance" ? [node.blueprint] : [],
    );
  for (const start of Object.keys(blueprints)) {
    const seen = new Set<LocalId>();
    const stack = placed(start);
    while (stack.length > 0) {
      const next = stack.pop() as LocalId;
      if (next === start) cyclic.add(start);
      if (seen.has(next) || !(next in blueprints)) continue;
      seen.add(next);
      stack.push(...placed(next));
    }
  }
  return cyclic;
}

export function compileInstance(id: LocalId, node: Extract<Node, { kind: "instance" }>, scope: GraphScope): Compiling {
  if (scope.cyclic.has(node.blueprint)) return { ok: false, problem: `Blueprint "${node.blueprint}" contains itself` };
  const blueprint = scope.blueprints.get(node.blueprint);
  if (!blueprint) return { ok: false, problem: `Unknown blueprint "${node.blueprint}"` };
  return {
    ok: true,
    draft: {
      id,
      kind: "instance",
      rates: [],
      cost: 0,
      blueprint: blueprint.index,
      info: { kind: "instance", blueprint: blueprint.index, ports: blueprint.ports },
    },
  };
}

export function compilePort(
  id: LocalId,
  node: Extract<Node, { kind: "port" }>,
  scope: GraphScope,
  items: Map<Id, number>,
): Compiling {
  if (!scope.inBlueprint) return { ok: false, problem: "Ports belong inside blueprints" };
  if (!items.has(node.item)) return { ok: false, problem: `Unknown item "${node.item}"` };
  // Inside, an `in` port supplies its item and an `out` port takes it.
  const perSecond = node.direction === "in" ? 1 : -1;
  return {
    ok: true,
    draft: { id, kind: "process", rates: [{ item: node.item, perSecond }], cost: 0, info: { kind: "port" } },
  };
}

/** The port indices an edge leaves and enters instances through, or why it can't. */
export function connectPorts(edge: Edge, from: Draft, to: Draft): { fromPort?: number; toPort?: number } | string {
  const through = (end: Draft, port: LocalId | undefined, entering: boolean): number | string | undefined => {
    if (end.kind !== "instance") return undefined;
    const direction = entering ? "in" : "out";
    if (port === undefined) return `reaches instance "${end.id}" without naming a port`;
    const ports = end.info.ports ?? [];
    const index = ports.findIndex((candidate) => candidate.id === port && candidate.entering === entering);
    const found = ports[index];
    if (!found) return `uses "${port}", which isn't an ${direction} port of instance "${end.id}"`;
    if (found.item !== edge.item) return `carries "${edge.item}", but port "${port}" carries "${found.item}"`;
    return index;
  };
  const fromPort = through(from, edge.fromPort, false);
  const toPort = through(to, edge.toPort, true);
  if (typeof fromPort === "string") return fromPort;
  if (typeof toPort === "string") return toPort;
  return { ...(fromPort !== undefined && { fromPort }), ...(toPort !== undefined && { toPort }) };
}

/**
 * Compiles the root graph and every blueprint (in id order: their index in the model) with `compileGraph`,
 * then gives all of them one numbering of items, in pack order.
 */
export function compileWithBlueprints(
  input: CompileInput,
  compileGraph: (input: CompileInput, scope: GraphScope) => Compiled,
): Compiled {
  const { document, pack } = input;
  const order = new Map(pack.items.map((item, index) => [item.id, index]));
  const cyclic = cyclicBlueprints(document.blueprints);
  const ids = Object.keys(document.blueprints)
    .filter((id) => !cyclic.has(id))
    .sort(byId);
  const blueprints = new Map(
    ids.map((id, index) => [id, { index, ports: portsOf(document.blueprints[id] as Blueprint, order) }]),
  );
  const scope = (name: string, graph: Graph, inBlueprint: boolean): GraphScope => ({
    name,
    graph,
    inBlueprint,
    blueprints,
    cyclic,
  });
  const root = compileGraph(input, scope("root", document.graph, false));
  if (ids.length === 0) return root;
  const bodies = ids.map((id) => {
    const blueprint = document.blueprints[id] as Blueprint;
    const body = compileGraph(input, scope(id, blueprint.graph, true));
    const ports = body.info.flatMap((info, index) => (info.kind === "port" ? [index] : []));
    return { ...body, name: blueprint.name, ports };
  });

  const items = [...new Set([root, ...bodies].flatMap((compiled) => compiled.items))].sort(
    (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
  );
  const shared = new Map(items.map((item, index) => [item, index]));
  const renumber = <C extends Compiled>(compiled: C): C => {
    const item = (index: number) => shared.get(compiled.items[index] as Id) as number;
    return {
      ...compiled,
      items,
      model: {
        ...compiled.model,
        items: items.length,
        nodes: compiled.model.nodes.map((node) => ({
          ...node,
          rates: node.rates.map((rate) => ({ ...rate, item: item(rate.item) })),
        })),
        edges: compiled.model.edges.map((edge) => ({ ...edge, item: item(edge.item) })),
      },
    };
  };
  const placed = bodies.map(renumber);
  const top = renumber(root);
  return {
    ...top,
    model: {
      ...top.model,
      blueprints: placed.map(({ model, ports }) => ({
        nodes: model.nodes,
        edges: model.edges,
        constraints: model.constraints,
        ports,
      })),
    },
    blueprints: placed,
  };
}

/** What an instance takes in and gives out through its ports, by item. */
export function addBoundaryFlows(
  info: NodeInfo,
  inside: InstanceSolution,
  inputs: Record<Id, number>,
  outputs: Record<Id, number>,
): void {
  (info.ports ?? []).forEach((port, index) => {
    const flows = port.entering ? inputs : outputs;
    flows[port.item] = (flows[port.item] ?? 0) + (inside.ports[index] ?? 0);
  });
}

/** Raw inputs and buildings inside instances: each instance is a copy of its blueprint, with machines of its own. */
export function addInsideTotals(
  compiled: Compiled,
  solution: Solution,
  raw: Record<Id, number>,
  buildings: Record<Id, number>,
): void {
  const visit = (graph: Compiled, inside: InstanceSolution) => {
    graph.info.forEach((info, index) => {
      const activity = inside.activity[index] ?? 0;
      if (activity <= 0) return;
      if (info.kind === "source") {
        for (const rate of graph.model.nodes[index]?.rates ?? []) {
          const item = graph.items[rate.item] as Id;
          raw[item] = (raw[item] ?? 0) + activity;
        }
      }
      if (info.context) {
        const building = info.context.building.id;
        buildings[building] = (buildings[building] ?? 0) + Math.ceil(clean(activity));
      }
    });
    for (const nested of inside.instances ?? []) placed(graph, nested);
  };
  const placed = (graph: Compiled, inside: InstanceSolution) => {
    const blueprint = graph.info[inside.node]?.blueprint;
    const body = blueprint === undefined ? undefined : compiled.blueprints?.[blueprint];
    if (body) visit(body, inside);
  };
  for (const inside of solution.instances ?? []) placed(compiled, inside);
}

/** Blueprints the solver had to inline, with a hint how to make them compile. */
export function inlineHints(compiled: Compiled, solution: Solution): Diagnostic[] {
  return (solution.inlined ?? []).map(({ blueprint, freedom }): Diagnostic => {
    const name = compiled.blueprints?.[blueprint]?.name ?? String(blueprint);
    const instance = compiled.info.findIndex((info) => info.kind === "instance" && info.blueprint === blueprint);
    return {
      kind: "hint",
      message:
        `Blueprint "${name}" can run in ${freedom} independent ways, so it is solved inline, which is slower. ` +
        "Pin machines inside it to fix their ratios, and it compiles into a macro recipe.",
      ...(instance >= 0 && { node: compiled.nodes[instance] as LocalId }),
    };
  });
}
