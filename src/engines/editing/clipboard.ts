// Copy and paste: what a copy of some nodes keeps, and how pasting it turns into commands. Pasted nodes and
// flows get fresh ids that keep the readable stem of the copied ones (`smelter-3fa9c1`); flows among the copied
// nodes come along (instance ports included), and with connections, so do the flows to the nodes they were
// connected to (same graph only). A copy of instances carries the blueprints they place, and a paste adds those the
// target lacks (alike ones are reused). Nodes the target graph can't hold are left out with their flows and named,
// rather than failing the paste. Pure: the manager passes in where new ids come from.
import { CLIPBOARD_FORMAT, type Clipboard, type CopiedBlueprint, type PasteOffset } from "../../contracts/clipboard";
import type { Blueprint, Document, Edge, LocalId, Node, Position } from "../../contracts/document";
import { fail, ok, type Result } from "../../contracts/result";
import { own } from "../../utilities/records";
import type { ResolvedCommand } from "./commands";
import { contains, graphOf, portsOf } from "./graphs";

export function copyNodes(document: Document, scope: string, nodeIds: LocalId[]): Result<Clipboard> {
  const graph = graphOf(document, scope);
  if (!graph) return fail([{ path: ["graph"], message: `Unknown graph ${scope}` }]);
  for (const [index, id] of nodeIds.entries()) {
    if (!own(graph.nodes, id)) return fail([{ path: ["nodeIds", index], message: `Unknown node ${id}` }]);
  }
  const chosen = new Set(nodeIds);
  const positions = own(document.layout, scope) ?? {};
  const nodes: Record<LocalId, Node> = {};
  const layout: Record<LocalId, Position> = {};
  for (const id of chosen) {
    nodes[id] = structuredClone(own(graph.nodes, id) as Node);
    layout[id] = structuredClone(own(positions, id) ?? { x: 0, y: 0 });
  }
  const edges: Record<LocalId, Edge> = {};
  const connections: Record<LocalId, Edge> = {};
  for (const [id, edge] of Object.entries(graph.edges)) {
    const from = chosen.has(edge.from);
    const to = chosen.has(edge.to);
    if (from && to) edges[id] = structuredClone(edge);
    else if (from || to) connections[id] = structuredClone(edge);
  }
  return ok({
    format: CLIPBOARD_FORMAT,
    version: 1,
    pack: { id: document.pack.id, version: document.pack.version },
    source: { documentId: document.id, graph: scope },
    graph: { nodes, edges },
    layout,
    connections,
    blueprints: placedBy(document, Object.values(nodes)),
  });
}

/** The blueprints the nodes' instances place, directly or deeper, with their layouts. */
function placedBy(document: Document, nodes: Node[]): Record<LocalId, CopiedBlueprint> {
  const blueprints: Record<LocalId, CopiedBlueprint> = {};
  const queue = nodes.flatMap((node) => (node.kind === "instance" ? [node.blueprint] : []));
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    const blueprint = own(document.blueprints, id);
    if (own(blueprints, id) || !blueprint) continue;
    blueprints[id] = { ...structuredClone(blueprint), layout: structuredClone(own(document.layout, id) ?? {}) };
    for (const node of Object.values(blueprint.graph.nodes)) if (node.kind === "instance") queue.push(node.blueprint);
  }
  return blueprints;
}

export interface PasteOptions {
  /** Added to every copied position: where the paste lands. */
  offset: PasteOffset;
  /** Also reconnect the flows to the nodes the copy left behind, when pasting into the graph it came from. */
  connections: boolean;
}

export interface Paste {
  /** One batch: the blueprints it brings along, the nodes, then their flows. */
  commands: ResolvedCommand[];
  /** The new nodes' ids, in the clipboard's order. */
  nodeIds: LocalId[];
  /** What couldn't be pasted here, for the person: "1 subgraph this factory doesn't have". */
  leftOut: string[];
}

export function pasteCommands(
  document: Document,
  scope: string,
  clipboard: Clipboard,
  { offset, connections }: PasteOptions,
  newId: () => string,
): Result<Paste> {
  const graph = graphOf(document, scope);
  if (!graph) return fail([{ path: ["graph"], message: `Unknown graph ${scope}` }]);

  // The blueprints the pasted instances place: the target's own where it has them as copied, else added.
  const carried = carriedBlueprints(document, clipboard, newId);
  const withCarried = carried.document;
  const nodeIdOf = new Map<LocalId, LocalId>();
  const pastedNodes = new Map<LocalId, Node>();
  const nodeCommands: ResolvedCommand[] = [];
  const fresh = freshIds(new Set(Object.keys(graph.nodes)), newId);
  const skipped = { port: 0, missing: 0, itself: 0 };
  for (const [id, copiedNode] of Object.entries(clipboard.graph.nodes)) {
    const blueprint = copiedNode.kind === "instance" ? carried.resolve(copiedNode.blueprint) : undefined;
    const node: Node = copiedNode.kind === "instance" ? { ...copiedNode, blueprint: blueprint ?? "" } : copiedNode;
    const problem = copiedNode.kind === "instance" && !blueprint ? "missing" : whyNot(withCarried, scope, node);
    if (problem) {
      skipped[problem] += 1;
      continue;
    }
    const newIdOfNode = fresh(id);
    nodeIdOf.set(id, newIdOfNode);
    pastedNodes.set(id, node);
    const at = own(clipboard.layout, id) ?? { x: 0, y: 0 };
    nodeCommands.push({
      type: "addNode",
      graph: scope,
      id: newIdOfNode,
      node,
      position: { ...at, x: at.x + offset.x, y: at.y + offset.y },
    });
  }
  const placed = [...pastedNodes.values()].flatMap((node) => (node.kind === "instance" ? [node.blueprint] : []));
  const commands: ResolvedCommand[] = [...carried.additionsFor(placed), ...nodeCommands];

  const freshEdge = freshIds(new Set(Object.keys(graph.edges)), newId);
  const portsFit = (edge: Edge, nodeOf: (id: LocalId) => Node | undefined) =>
    (edge.fromPort === undefined || portsOf(withCarried, nodeOf(edge.from), "out").includes(edge.fromPort)) &&
    (edge.toPort === undefined || portsOf(withCarried, nodeOf(edge.to), "in").includes(edge.toPort));
  const pastedNode = (id: LocalId) => pastedNodes.get(id);
  for (const [id, edge] of Object.entries(clipboard.graph.edges)) {
    const from = nodeIdOf.get(edge.from);
    const to = nodeIdOf.get(edge.to);
    if (!from || !to || !portsFit(edge, pastedNode)) continue;
    commands.push({ type: "connect", graph: scope, id: freshEdge(id), edge: { ...edge, from, to } });
  }

  const sameGraph = clipboard.source.documentId === document.id && clipboard.source.graph === scope;
  if (connections && sameGraph) {
    // One end is a pasted node, the other the node it was connected to, if that's still there.
    const nodeOf = (end: LocalId) => pastedNodes.get(end) ?? own(graph.nodes, end);
    for (const [id, edge] of Object.entries(clipboard.connections)) {
      const pastedFrom = nodeIdOf.get(edge.from);
      const pastedTo = nodeIdOf.get(edge.to);
      if (!pastedFrom === !pastedTo) continue;
      const from = pastedFrom ?? edge.from;
      const to = pastedTo ?? edge.to;
      if (!own(graph.nodes, pastedFrom ? to : from) || !portsFit(edge, nodeOf)) continue;
      commands.push({ type: "connect", graph: scope, id: freshEdge(id), edge: { ...edge, from, to } });
    }
  }

  return ok({ commands, nodeIds: [...nodeIdOf.values()], leftOut: leftOutText(skipped) });
}

/** "Paste 5 nodes", for the history. */
export function pasteLabel(count: number): string {
  return `Paste ${count} ${count === 1 ? "node" : "nodes"}`;
}

interface Carried {
  /** The id in the target of a blueprint copied under `id`; undefined when neither the copy nor the target has it. */
  resolve(id: LocalId): LocalId | undefined;
  /** The document with the blueprints the paste would add, to check ports and containment against. */
  document: Document;
  /** The `addBlueprint` commands that the instances placing these (resolved) blueprints need, inner ones first. */
  additionsFor(placed: LocalId[]): ResolvedCommand[];
}

/**
 * Where the blueprints a copy carries go in the target, by content: a copied blueprint is the target's blueprint
 * of the same id when they're alike (same name, same graph, the blueprints it places resolved first), else the
 * first one of the target (or of this paste) that is, else it's added: under its own id when that's free, under a
 * fresh one keeping its stem when not, and named apart (" 2") when another blueprint has its name. Layouts don't
 * count: where nodes sit inside doesn't make a blueprint another. Pasted into the document it was copied from, an
 * instance places the blueprint it placed there (as it is now), and a clipboard without blueprints (older copies)
 * finds them in the target by id, as before.
 */
function carriedBlueprints(document: Document, clipboard: Clipboard, newId: () => string): Carried {
  const blueprints: Record<LocalId, Blueprint> = { ...document.blueprints };
  const virtual: Document = { ...document, blueprints };
  const resolved = new Map<LocalId, LocalId | undefined>();
  const additions = new Map<LocalId, Extract<ResolvedCommand, { type: "addBlueprint" }>>();
  const fromHere = clipboard.source.documentId === document.id;
  const taken = new Set(["root", ...Object.keys(blueprints)]);
  const fresh = freshIds(taken, newId);

  const resolve = (id: LocalId): LocalId | undefined => {
    if (resolved.has(id)) return resolved.get(id);
    const copied = own(clipboard.blueprints, id);
    // In the factory it came from, an instance places its blueprint as it is now, edited since or not.
    if (!copied || (fromHere && own(document.blueprints, id))) return own(blueprints, id) ? id : undefined;
    resolved.set(id, undefined); // A blueprint that places itself (files may hold one) resolves to nothing.
    const nodes: Record<LocalId, Node> = {};
    for (const [nodeId, node] of Object.entries(copied.graph.nodes)) {
      const inner = node.kind === "instance" ? resolve(node.blueprint) : undefined;
      if (node.kind === "instance" && inner === undefined) return undefined;
      nodes[nodeId] = node.kind === "instance" ? { ...node, blueprint: inner as LocalId } : node;
    }
    const wanted: Blueprint = { name: copied.name, graph: { nodes, edges: copied.graph.edges } };
    const key = canonical(wanted);
    const alike = (candidate: LocalId) => canonical(own(blueprints, candidate)) === key;
    const existing = alike(id) ? id : Object.keys(blueprints).find(alike);
    if (existing !== undefined) {
      resolved.set(id, existing);
      return existing;
    }
    const target = taken.has(id) ? fresh(id) : id;
    taken.add(target);
    const names = new Set(Object.values(blueprints).map((blueprint) => blueprint.name));
    let name = copied.name;
    for (let suffix = 2; names.has(name); suffix++) name = `${copied.name} ${suffix}`;
    const added: Blueprint = { ...wanted, name };
    blueprints[target] = added;
    // Positions of nodes it doesn't have (a hand-edited file's) would fail the whole paste.
    const layout = Object.fromEntries(Object.entries(copied.layout).filter(([nodeId]) => own(nodes, nodeId)));
    additions.set(target, { type: "addBlueprint", id: target, blueprint: added, layout });
    resolved.set(id, target);
    return target;
  };

  const additionsFor = (placed: LocalId[]) => {
    const needed = new Set<LocalId>();
    const visit = (id: LocalId) => {
      if (needed.has(id) || !additions.has(id)) return;
      needed.add(id);
      for (const node of Object.values(own(blueprints, id)?.graph.nodes ?? {})) {
        if (node.kind === "instance") visit(node.blueprint);
      }
    };
    placed.forEach(visit);
    return [...additions].flatMap(([id, command]) => (needed.has(id) ? [command] : []));
  };

  for (const id of Object.keys(clipboard.blueprints)) resolve(id);
  return { resolve, document: virtual, additionsFor };
}

/** JSON with every object's keys sorted, so records that hold the same compare equal whatever their order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : inner,
  );
}

/** Why a copied node can't go into this graph, if it can't. */
function whyNot(document: Document, scope: string, node: Node): "port" | "missing" | "itself" | undefined {
  if (node.kind === "port" && scope === "root") return "port";
  if (node.kind !== "instance") return;
  if (!own(document.blueprints, node.blueprint)) return "missing";
  if (contains(document, node.blueprint, scope)) return "itself";
}

function leftOutText({ port, missing, itself }: { port: number; missing: number; itself: number }): string[] {
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  return [
    ...(port > 0 ? [`${plural(port, "subgraph port")} (ports only exist inside subgraphs)`] : []),
    ...(missing > 0 ? [`${plural(missing, "subgraph")} this factory doesn't have`] : []),
    ...(itself > 0 ? [`${plural(itself, "subgraph")} that would contain itself`] : []),
  ];
}

/**
 * New ids that keep a copied id's readable stem (`smelter-3fa9c1` → `smelter-…`) and are free in the graph, also
 * of each other.
 */
function freshIds(taken: Set<string>, newId: () => string): (original: LocalId) => LocalId {
  return (original) => {
    const stem = original.replace(/(-[0-9a-f]{4,})+$/i, "") || "node";
    for (;;) {
      const candidate = `${stem}-${newId().replace(/-/g, "").slice(0, 6)}`;
      if (!taken.has(candidate)) {
        taken.add(candidate);
        return candidate;
      }
    }
  };
}
