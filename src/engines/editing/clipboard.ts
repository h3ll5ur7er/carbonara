// Copy and paste: what a copy of some nodes keeps, and how pasting it turns into commands. Pasted nodes and
// flows get fresh ids that keep the readable stem of the copied ones (`smelter-3fa9c1`); flows among the copied
// nodes come along (instance ports included), and with connections, so do the flows to the nodes they were
// connected to (same graph only). Nodes the target graph can't hold are left out with their flows and named, rather
// than failing the paste. Pure: the manager passes in where new ids come from.
import { CLIPBOARD_FORMAT, type Clipboard, type PasteOffset } from "../../contracts/clipboard";
import type { Document, Edge, LocalId, Node, Position } from "../../contracts/document";
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
  });
}

export interface PasteOptions {
  /** Added to every copied position: where the paste lands. */
  offset: PasteOffset;
  /** Also reconnect the flows to the nodes the copy left behind, when pasting into the graph it came from. */
  connections: boolean;
}

export interface Paste {
  /** One batch: the nodes, then their flows. */
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

  const nodeIdOf = new Map<LocalId, LocalId>();
  const commands: ResolvedCommand[] = [];
  const fresh = freshIds(new Set(Object.keys(graph.nodes)), newId);
  const skipped = { port: 0, missing: 0, itself: 0 };
  for (const [id, node] of Object.entries(clipboard.graph.nodes)) {
    const problem = whyNot(document, scope, node);
    if (problem) {
      skipped[problem] += 1;
      continue;
    }
    const newIdOfNode = fresh(id);
    nodeIdOf.set(id, newIdOfNode);
    const at = own(clipboard.layout, id) ?? { x: 0, y: 0 };
    commands.push({
      type: "addNode",
      graph: scope,
      id: newIdOfNode,
      node,
      position: { ...at, x: at.x + offset.x, y: at.y + offset.y },
    });
  }

  const freshEdge = freshIds(new Set(Object.keys(graph.edges)), newId);
  const portsFit = (edge: Edge, nodeOf: (id: LocalId) => Node | undefined) =>
    (edge.fromPort === undefined || portsOf(document, nodeOf(edge.from), "out").includes(edge.fromPort)) &&
    (edge.toPort === undefined || portsOf(document, nodeOf(edge.to), "in").includes(edge.toPort));
  const pastedNode = (id: LocalId) => own(clipboard.graph.nodes, id);
  for (const [id, edge] of Object.entries(clipboard.graph.edges)) {
    const from = nodeIdOf.get(edge.from);
    const to = nodeIdOf.get(edge.to);
    if (!from || !to || !portsFit(edge, pastedNode)) continue;
    commands.push({ type: "connect", graph: scope, id: freshEdge(id), edge: { ...edge, from, to } });
  }

  const sameGraph = clipboard.source.documentId === document.id && clipboard.source.graph === scope;
  if (connections && sameGraph) {
    // One end is a pasted node, the other the node it was connected to, if that's still there.
    const nodeOf = (end: LocalId) => own(clipboard.graph.nodes, end) ?? own(graph.nodes, end);
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
