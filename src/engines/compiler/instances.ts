// Blueprints and their instances in the solver IR (docs/Architecture/Subgraphs.md). Every graph compiles
// the same way; this file adds what is special about subgraphs: which blueprints a graph can place, how
// instance and port nodes compile, how edges reach an instance through its ports, and how the graphs
// join into one model with one numbering of items. How blueprints are summarised is the solver's business.
import type { Blueprint, Document, Edge, Graph, LocalId, Node } from "../../contracts/document";
import type { Id } from "../../contracts/pack";
import type { Diagnostic } from "../../contracts/results";
import type { InstanceSolution, Solution } from "../../contracts/solver";
import { clean } from "../../utilities/numbers";
import { addTo } from "../../utilities/records";
import type { Compiled, Compiling, Draft, NodeInfo } from "./compile";

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
      if (seen.has(next) || !Object.hasOwn(blueprints, next)) continue;
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

/** The blueprints a document's graphs can place: in id order (their index in the model), with their ports. */
export interface BlueprintScope {
  /** What the scope was made from. */
  source: Document["blueprints"];
  ids: LocalId[];
  blueprints: GraphScope["blueprints"];
  cyclic: Set<LocalId>;
}

/**
 * The document's blueprints as instances see them. Reuses `previous` while the blueprints are the same, and
 * its entries while a blueprint keeps its index and ports, so instances of a redesigned blueprint stay compiled.
 */
export function blueprintScope(
  source: Document["blueprints"],
  items: Map<Id, number>,
  previous: BlueprintScope | undefined,
): BlueprintScope {
  if (previous?.source === source) return previous;
  const cyclic = cyclicBlueprints(source);
  const ids = Object.keys(source)
    .filter((id) => !cyclic.has(id))
    .sort(byId);
  const blueprints = new Map(
    ids.map((id, index) => {
      const ports = portsOf(source[id] as Blueprint, items);
      const known = previous?.blueprints.get(id);
      const same = known && known.index === index && samePorts(known.ports, ports);
      return [id, same ? known : { index, ports }];
    }),
  );
  return { source, ids, blueprints, cyclic };
}

function samePorts(a: Port[], b: Port[]): boolean {
  return (
    a.length === b.length &&
    a.every((port, at) => {
      const other = b[at] as Port;
      return port.id === other.id && port.item === other.item && port.entering === other.entering;
    })
  );
}

/** A blueprint of a compiled document by id, with its index in the model. */
export function findBlueprint(compiled: Compiled, graph: LocalId): { index: number; compiled: Compiled } | undefined {
  const blueprints = compiled.blueprints ?? [];
  const index = blueprints.findIndex((blueprint) => blueprint.graph === graph);
  const found = blueprints[index];
  // Nested instances in the blueprint's results look their blueprints up in the document's.
  return found && { index, compiled: { ...found, blueprints } };
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
    addTo(flows, port.item, inside.ports[index] ?? 0);
  });
}

/**
 * Raw inputs and buildings inside instances: each instance is a copy of its blueprint, with machines of its own.
 * What an instance adds is remembered in `memo` while its solution is the same object at the same position, and
 * added in the same order every time, so the totals come out the same to the last bit.
 */
export function addInsideTotals(
  compiled: Compiled,
  solution: Solution,
  raw: Record<Id, number>,
  buildings: Record<Id, number>,
  memo: InsideMemo = { insides: [], adds: [] },
): void {
  const visit = (graph: Compiled, inside: InstanceSolution, adds: InsideTotals) => {
    graph.info.forEach((info, index) => {
      const activity = inside.activity[index] ?? 0;
      if (activity <= 0) return;
      if (info.kind === "source") {
        for (const rate of graph.model.nodes[index]?.rates ?? [])
          adds.raw.push([graph.items[rate.item] as Id, activity]);
      }
      if (info.context) adds.buildings.push([info.context.building.id, Math.ceil(clean(activity))]);
    });
    for (const nested of inside.instances ?? []) placed(graph, nested, adds);
  };
  const placed = (graph: Compiled, inside: InstanceSolution, adds: InsideTotals) => {
    const blueprint = graph.info[inside.node]?.blueprint;
    const body = blueprint === undefined ? undefined : compiled.blueprints?.[blueprint];
    if (body) visit(body, inside, adds);
  };
  const insides = solution.instances ?? [];
  const added = insides.map((inside, at) => {
    const known = memo.insides[at] === inside ? memo.adds[at] : undefined;
    if (known) return known;
    const adds: InsideTotals = { raw: [], buildings: [] };
    placed(compiled, inside, adds);
    return adds;
  });
  Object.assign(memo, { insides, adds: added });
  for (const adds of added) {
    for (const [item, amount] of adds.raw) addTo(raw, item, amount);
    for (const [building, count] of adds.buildings) addTo(buildings, building, count);
  }
}

/** What instances added to the totals, by position. */
export interface InsideMemo {
  insides: InstanceSolution[];
  adds: InsideTotals[];
}

/** What one instance adds to the totals, in the order it adds it. */
export interface InsideTotals {
  raw: [Id, number][];
  buildings: [Id, number][];
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
