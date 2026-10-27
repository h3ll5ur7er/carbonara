// The editing engine's subgraph rules: collapsing nodes into a new blueprint with ports inferred from the flows
// that cross the selection, and expanding an instance back into the graph around it. Expanding what a collapse
// made gives back exactly the document before it (property-tested), so the two are each other's inverse.
import { current, isDraft } from "immer";
import type { Command } from "../../contracts/commands";
import type { Document, Edge, Graph, LocalId, Node, Position } from "../../contracts/document";
import type { Issue } from "../../contracts/issues";
import { allGraphs, contains, freeId, issue } from "./graphs";

type Collapse = Omit<Extract<Command, { type: "collapse" }>, "blueprint" | "instance"> & {
  blueprint: LocalId;
  instance: LocalId;
};
type Expand = Extract<Command, { type: "expand" }>;
type Direction = "in" | "out";

/**
 * Port pills on the canvas, in flow units, and the room around them. The engine only needs a rough match to
 * keep new ports clear of the nodes beside them; arranging tidies up the rest.
 */
const PORT = { width: 264, height: 72 };
const GAP = 96;
const GRID = 24;

/** One end of a flow: a node, and the port it uses when it's an instance. */
interface End {
  node: LocalId;
  port?: LocalId | undefined;
}

/** A flow that crosses the selection, seen from the boundary. */
interface Crossing {
  id: LocalId;
  edge: Edge;
  outside: End;
  inside: End;
}

/** Collapses the selected nodes of `graph` (the `scope`) into a new blueprint. */
export function collapse(document: Document, scope: string, graph: Graph, command: Collapse): Issue | undefined {
  const { blueprint, instance } = command;
  if (blueprint === "root") return issue(["blueprint"], "A blueprint can't be called root");
  if (document.blueprints[blueprint]) return issue(["blueprint"], `Blueprint ${blueprint} already exists`);
  if (graph.nodes[instance]) return issue(["instance"], `Node ${instance} already exists`);
  for (const [index, id] of command.ids.entries()) {
    const node = graph.nodes[id];
    if (!node) return issue(["ids", index], `Unknown node ${id}`);
    if (node.kind === "port") return issue(["ids", index], "Ports can't be collapsed into a subgraph");
  }

  const selected = new Set(command.ids);
  const positions = document.layout[scope] ?? {};
  const inside: Graph = { nodes: {}, edges: {} };
  const insideLayout: Record<LocalId, Position> = {};
  const crossing: Record<Direction, Crossing[]> = { in: [], out: [] };

  for (const id of selected) {
    inside.nodes[id] = copy(graph.nodes[id] as Node);
    const position = positions[id];
    if (position) insideLayout[id] = copy(position);
  }
  for (const [id, edge] of sortedEntries(graph.edges)) {
    const from = selected.has(edge.from);
    const to = selected.has(edge.to);
    if (from && to) inside.edges[id] = copy(edge);
    else if (to) crossing.in.push({ id, edge, outside: end(edge, "from"), inside: end(edge, "to") });
    else if (from) crossing.out.push({ id, edge, outside: end(edge, "to"), inside: end(edge, "from") });
  }

  // The instance takes the selection's top-left corner; expanding puts the nodes back relative to it.
  const placed = Object.values(insideLayout);
  const corner = placed.length > 0 ? topLeft(placed) : { x: command.bounds?.x ?? 0, y: command.bounds?.y ?? 0 };
  const bounds = command.bounds ?? estimatedBounds(placed, corner);

  const outside: [LocalId, Edge][] = [];
  for (const direction of ["in", "out"] as const) {
    const groups = portGroups(crossing[direction], direction);
    const column = direction === "in" ? bounds.x - GAP - PORT.width : bounds.x + bounds.width + GAP;
    const top = bounds.y + bounds.height / 2 - (groups.length * (PORT.height + GRID) - GRID) / 2;
    groups.forEach((group, row) => {
      const [first] = group;
      if (!first) return;
      const port = freeId((id) => id in inside.nodes, `${direction}-${first.edge.item}`);
      inside.nodes[port] = { kind: "port", direction, item: first.edge.item };
      insideLayout[port] = { x: snap(column), y: snap(top + row * (PORT.height + GRID)) };
      for (const [id, edge] of halves(group, direction, port, instance, "inside")) inside.edges[id] = edge;
      outside.push(...halves(group, direction, port, instance, "outside"));
    });
  }

  for (const id of selected) {
    Reflect.deleteProperty(graph.nodes, id);
    Reflect.deleteProperty(positions, id);
  }
  for (const id of [...Object.keys(inside.edges), ...crossing.in.map((c) => c.id), ...crossing.out.map((c) => c.id)]) {
    Reflect.deleteProperty(graph.edges, id);
  }
  graph.nodes[instance] = { kind: "instance", blueprint };
  (document.layout[scope] ??= {})[instance] = corner;
  for (const [id, edge] of outside) graph.edges[id] = edge;
  document.blueprints[blueprint] = { name: command.name, graph: inside };
  document.layout[blueprint] = insideLayout;
}

/** Expands the instance `command.id` of `graph` (the `scope`) into a copy of its blueprint's nodes and flows. */
export function expand(document: Document, scope: string, graph: Graph, command: Expand): Issue | undefined {
  const instance = graph.nodes[command.id];
  if (instance?.kind !== "instance") {
    return issue(["id"], instance ? `${command.id} is not a subgraph instance` : `Unknown node ${command.id}`);
  }
  const blueprintId = instance.blueprint;
  const blueprint = document.blueprints[blueprintId];
  if (!blueprint) return issue(["id"], `Unknown blueprint ${blueprintId}`);
  const body = blueprint.graph;
  for (const node of Object.values(body.nodes)) {
    if (node.kind === "instance" && contains(document, node.blueprint, scope)) {
      return issue(["id"], `Blueprint ${node.blueprint} can't contain itself`);
    }
  }

  const isPort = (id: LocalId) => body.nodes[id]?.kind === "port";
  const inner = sortedEntries(body.nodes).filter(([id]) => !isPort(id));
  const innerLayout = document.layout[blueprintId] ?? {};
  const positions = (document.layout[scope] ??= {});
  const at = positions[command.id] ?? { x: 0, y: 0 };
  const placed = inner.flatMap(([id]) => innerLayout[id] ?? []);
  const origin = placed.length > 0 ? topLeft(placed) : at;
  const offset = { x: at.x - origin.x, y: at.y - origin.y };

  const around = sortedEntries(graph.edges).filter(([, edge]) => edge.from === command.id || edge.to === command.id);
  Reflect.deleteProperty(graph.nodes, command.id);
  Reflect.deleteProperty(positions, command.id);
  for (const [id] of around) Reflect.deleteProperty(graph.edges, id);

  const names = new Map<LocalId, LocalId>();
  for (const [id, node] of inner) {
    const name = freeId((taken) => taken in graph.nodes, id);
    names.set(id, name);
    graph.nodes[name] = copy(node);
    const position = innerLayout[id];
    if (position) positions[name] = { ...copy(position), x: position.x + offset.x, y: position.y + offset.y };
  }
  const add = (id: LocalId, edge: Edge) => {
    graph.edges[freeId((taken) => taken in graph.edges, id)] = edge;
  };
  const named = (id: LocalId) => names.get(id) ?? id;

  for (const [id, edge] of sortedEntries(body.edges)) {
    if (!isPort(edge.from) && !isPort(edge.to)) add(id, { ...copy(edge), from: named(edge.from), to: named(edge.to) });
  }

  // Each port joins the flows that reached it from outside with those that left it inside (and the other way).
  const through = (port: LocalId, direction: Direction) =>
    around.filter(([, edge]) =>
      direction === "in"
        ? edge.to === command.id && edge.toPort === port
        : edge.from === command.id && edge.fromPort === port,
    );
  for (const [port, node] of sortedEntries(body.nodes)) {
    if (node.kind !== "port") continue;
    const outer = through(port, node.direction);
    const innerEdges = sortedEntries(body.edges).filter(([, edge]) =>
      node.direction === "in" ? edge.from === port : edge.to === port,
    );
    for (const [innerId, innerEdge] of innerEdges) {
      // Flows straight from an input to an output are joined from the input's side.
      if (node.direction === "out" && isPort(innerEdge.from)) continue;
      // A flow from an input straight to an output passes through: join the flows outside both.
      const passOn = node.direction === "in" && isPort(innerEdge.to) ? through(innerEdge.to, "out") : undefined;
      for (const [outerId, outerEdge] of outer) {
        if (outerEdge.item !== innerEdge.item) continue;
        if (passOn) {
          for (const [nextId, next] of passOn) {
            if (next.item !== innerEdge.item) continue;
            add(`${outerId}+${nextId}`, {
              ...fromOf(outerEdge),
              ...toOf(next),
              item: innerEdge.item,
              ...logistics(innerEdge.logistics ?? outerEdge.logistics ?? next.logistics),
              ...(outerEdge.ratio !== undefined && { ratio: outerEdge.ratio }),
            });
          }
          continue;
        }
        // The half that stands for one flow names it and gives its belt; a share stays with its source's half.
        const single = outer.length === 1 ? innerId : innerEdges.length === 1 ? outerId : undefined;
        const [perFlow, shared] = single === innerId ? [innerEdge, outerEdge] : [outerEdge, innerEdge];
        const ratio = node.direction === "in" ? outerEdge.ratio : innerEdge.ratio;
        const ends =
          node.direction === "in"
            ? { ...fromOf(outerEdge), ...toOf(innerEdge, named) }
            : { ...fromOf(innerEdge, named), ...toOf(outerEdge) };
        add(single ?? `${outerId}+${innerId}`, {
          ...ends,
          item: innerEdge.item,
          ...logistics(perFlow.logistics ?? shared.logistics),
          ...(ratio !== undefined && { ratio }),
        });
      }
    }
  }

  const placedElsewhere = allGraphs(document).some((other) =>
    Object.values(other.nodes).some((node) => node.kind === "instance" && node.blueprint === blueprintId),
  );
  if (!placedElsewhere) {
    Reflect.deleteProperty(document.blueprints, blueprintId);
    Reflect.deleteProperty(document.layout, blueprintId);
  }
}

/**
 * The ports for the flows crossing in one direction: flows of one item between one node outside and several
 * inside (or several outside and one inside) share a port when the shared half loses nothing (a share of a
 * source's output can't be shared); every other flow gets a port of its own.
 */
function portGroups(crossings: Crossing[], direction: Direction): Crossing[][] {
  const groups: Crossing[][] = [];
  let rest = crossings;
  for (const side of ["outside", "inside"] as const) {
    const bySide = new Map<string, Crossing[]>();
    for (const crossing of rest) {
      const key = `${crossing.edge.item}\u0000${endKey(crossing[side])}`;
      bySide.set(key, [...(bySide.get(key) ?? []), crossing]);
    }
    const other = side === "outside" ? "inside" : "outside";
    // The shared half is the source's when outside sources share an input or inside sources an output.
    const sharedIsSource = (side === "outside") === (direction === "in");
    const taken = new Set<Crossing>();
    for (const group of bySide.values()) {
      const distinct = new Set(group.map((crossing) => endKey(crossing[other]))).size === group.length;
      const shareable = !sharedIsSource || group.every((crossing) => crossing.edge.ratio === undefined);
      if (group.length < 2 || !distinct || !shareable) continue;
      groups.push(group);
      for (const crossing of group) taken.add(crossing);
    }
    rest = rest.filter((crossing) => !taken.has(crossing));
  }
  groups.push(...rest.map((crossing) => [crossing]));
  return groups.sort((a, b) => (a[0]?.id ?? "").localeCompare(b[0]?.id ?? ""));
}

/**
 * The halves of a port's flows on one side of the boundary: one per flow, except on the side the group shares,
 * which gets one flow under the first flow's id, with their belt if they all had the same one.
 */
function halves(
  group: Crossing[],
  direction: Direction,
  port: LocalId,
  instance: LocalId,
  side: "inside" | "outside",
): [LocalId, Edge][] {
  const [first] = group;
  if (!first) return [];
  const sharedSide =
    group.length < 2
      ? undefined
      : new Set(group.map((crossing) => endKey(crossing.outside))).size === 1
        ? "outside"
        : "inside";
  const members = sharedSide === side ? [first] : group;
  const sourceSide = direction === "in" ? "outside" : "inside";
  return members.map((crossing) => {
    const belts = new Set((sharedSide === side ? group : [crossing]).map((member) => member.edge.logistics));
    const [belt] = belts;
    const own = side === "outside" ? crossing.outside : crossing.inside;
    const boundary: End = side === "outside" ? { node: instance, port } : { node: port };
    const [from, to] =
      direction === "in"
        ? [side === "outside" ? own : boundary, side === "outside" ? boundary : own]
        : [side === "outside" ? boundary : own, side === "outside" ? own : boundary];
    const edge: Edge = {
      from: from.node,
      ...(from.port !== undefined && { fromPort: from.port }),
      to: to.node,
      ...(to.port !== undefined && { toPort: to.port }),
      item: crossing.edge.item,
      ...logistics(belts.size === 1 ? belt : undefined),
      ...(side === sourceSide && crossing.edge.ratio !== undefined && { ratio: crossing.edge.ratio }),
    };
    return [crossing.id, edge];
  });
}

function end(edge: Edge, side: "from" | "to"): End {
  return side === "from" ? { node: edge.from, port: edge.fromPort } : { node: edge.to, port: edge.toPort };
}

/** An edge's start as edge fields, its node renamed. */
function fromOf(edge: Edge, named = (id: LocalId) => id): Pick<Edge, "from" | "fromPort"> {
  return { from: named(edge.from), ...(edge.fromPort !== undefined && { fromPort: edge.fromPort }) };
}

/** An edge's end as edge fields, its node renamed. */
function toOf(edge: Edge, named = (id: LocalId) => id): Pick<Edge, "to" | "toPort"> {
  return { to: named(edge.to), ...(edge.toPort !== undefined && { toPort: edge.toPort }) };
}

/** A plain copy of part of the document, which may be an Immer draft. */
function copy<T>(value: T): T {
  return isDraft(value) ? (current(value as object) as T) : structuredClone(value);
}

function logistics(belt: string | undefined): Pick<Edge, "logistics"> {
  return belt === undefined ? {} : { logistics: belt };
}

function endKey(end: End): string {
  return `${end.node}\u0000${end.port ?? ""}`;
}

function topLeft(positions: Position[]): { x: number; y: number } {
  return { x: Math.min(...positions.map((p) => p.x)), y: Math.min(...positions.map((p) => p.y)) };
}

/** The selection's area when the caller didn't say: from the positions, and sizes where they're known. */
function estimatedBounds(positions: Position[], corner: { x: number; y: number }) {
  const right = Math.max(corner.x, ...positions.map((p) => p.x + (p.width ?? 0)));
  const bottom = Math.max(corner.y, ...positions.map((p) => p.y + (p.height ?? 0)));
  return { x: corner.x, y: corner.y, width: right - corner.x, height: bottom - corner.y };
}

function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

function sortedEntries<T>(record: Record<string, T>): [string, T][] {
  return Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
