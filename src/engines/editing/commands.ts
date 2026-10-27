// Editing engine: how graphs are edited. Applies a batch of commands to a document as one step and returns the
// Immer patches and inverse patches that redo and undo it. Invalid edits are rejected as values, and the whole
// batch with them. Pure: ids of new nodes and edges arrive with the commands; the manager chooses them.
import { applyPatches as applyImmerPatches, enablePatches, produceWithPatches } from "immer";
import type { Command } from "../../contracts/commands";
import type { Document, Graph, Node } from "../../contracts/document";
import type { Issue } from "../../contracts/issues";
import type { Patch } from "../../contracts/patches";
import { fail, ok, type Result } from "../../contracts/result";

// Immer's patch support is opt-in; enabling it twice is harmless.
enablePatches();

type WithId<C> = C extends { type: "addNode" | "connect" } ? Omit<C, "id"> & { id: string } : C;
/** A command whose new node or edge already has its id. */
export type ResolvedCommand = WithId<Command>;

export interface Edit {
  document: Document;
  /** Turn the old document into the new one (redo, and what clients apply). */
  patches: Patch[];
  /** Turn the new document back into the old one (undo). */
  inversePatches: Patch[];
}

export function applyCommands(document: Document, commands: ResolvedCommand[]): Result<Edit> {
  const issues: Issue[] = [];
  const [next, patches, inversePatches] = produceWithPatches(document, (draft) => {
    for (const [index, command] of commands.entries()) {
      const issue = applyCommand(draft, command);
      if (issue) {
        issues.push({ path: ["commands", index, ...issue.path], message: issue.message });
        return;
      }
    }
  });
  return issues.length > 0 ? fail(issues) : ok({ document: next, patches, inversePatches });
}

/** Replays patches from an `Edit`: its inverse patches to undo it, its patches to redo it. */
export function applyPatches(document: Document, patches: Patch[]): Document {
  return applyImmerPatches(document, patches);
}

const LABELS: Record<Command["type"], string> = {
  addNode: "Add node",
  removeNodes: "Delete nodes",
  connect: "Connect",
  disconnect: "Disconnect",
  moveNodes: "Move nodes",
  setNodeFields: "Change fields",
  setPin: "Change pin",
};

/** A name for the history when the caller gives none. */
export function describeCommands(commands: Command[]): string {
  const types = new Set(commands.map((command) => command.type));
  const [only] = types;
  return types.size === 1 && only ? LABELS[only] : "Edit";
}

/** Mutates the draft, or returns the problem (relative to the command) without touching it. */
function applyCommand(document: Document, command: ResolvedCommand): Issue | undefined {
  const scope = command.graph;
  const graph = graphOf(document, scope);
  if (!graph) return issue(["graph"], `Unknown graph ${scope}`);

  switch (command.type) {
    case "addNode": {
      if (graph.nodes[command.id]) return issue(["id"], `Node ${command.id} already exists`);
      const problem = checkNode(document, scope, command.node);
      if (problem) return problem;
      graph.nodes[command.id] = structuredClone(command.node);
      (document.layout[scope] ??= {})[command.id] = structuredClone(command.position);
      return;
    }
    case "removeNodes": {
      for (const [index, id] of command.ids.entries()) {
        if (!graph.nodes[id]) return issue(["ids", index], `Unknown node ${id}`);
      }
      removeNodes(document, scope, graph, new Set(command.ids));
      return;
    }
    case "connect": {
      const { id, edge } = command;
      if (graph.edges[id]) return issue(["id"], `Edge ${id} already exists`);
      for (const end of ["from", "to"] as const) {
        if (!graph.nodes[edge[end]]) return issue(["edge", end], `Unknown node ${edge[end]}`);
      }
      if (edge.fromPort !== undefined && !portsOf(document, graph.nodes[edge.from], "out").includes(edge.fromPort)) {
        return issue(["edge", "fromPort"], `${edge.from} has no out port ${edge.fromPort}`);
      }
      if (edge.toPort !== undefined && !portsOf(document, graph.nodes[edge.to], "in").includes(edge.toPort)) {
        return issue(["edge", "toPort"], `${edge.to} has no in port ${edge.toPort}`);
      }
      graph.edges[id] = structuredClone(edge);
      return;
    }
    case "disconnect": {
      for (const [index, id] of command.ids.entries()) {
        if (!graph.edges[id]) return issue(["ids", index], `Unknown edge ${id}`);
      }
      for (const id of command.ids) Reflect.deleteProperty(graph.edges, id);
      return;
    }
    case "moveNodes": {
      const positions = Object.entries(command.positions);
      for (const [id] of positions) {
        if (!graph.nodes[id]) return issue(["positions", id], `Unknown node ${id}`);
      }
      for (const [id, position] of positions) (document.layout[scope] ??= {})[id] = structuredClone(position);
      return;
    }
    case "setNodeFields":
    case "setPin": {
      const node = graph.nodes[command.id];
      if (!node) return issue(["id"], `Unknown node ${command.id}`);
      if (node.kind !== "recipe") return issue(["id"], `${command.id} is not a recipe node`);
      if (command.type === "setNodeFields") Object.assign((node.fields ??= {}), command.fields);
      else if (command.pin === null) delete node.pin;
      else node.pin = structuredClone(command.pin);
      return;
    }
  }
}

function checkNode(document: Document, scope: string, node: Node): Issue | undefined {
  if (node.kind === "port" && scope === "root") return issue(["node", "kind"], "Ports only exist inside blueprints");
  if (node.kind !== "instance") return;
  if (!document.blueprints[node.blueprint]) return issue(["node", "blueprint"], `Unknown blueprint ${node.blueprint}`);
  if (contains(document, node.blueprint, scope, new Set())) {
    return issue(["node", "blueprint"], `Blueprint ${node.blueprint} can't contain itself`);
  }
}

/** Removes the nodes with their positions and edges, including edges that reach a removed port from outside. */
function removeNodes(document: Document, scope: string, graph: Graph, ids: Set<string>): void {
  const ports = new Set([...ids].filter((id) => graph.nodes[id]?.kind === "port"));
  for (const id of ids) {
    Reflect.deleteProperty(graph.nodes, id);
    const positions = document.layout[scope];
    if (positions) Reflect.deleteProperty(positions, id);
  }
  for (const [id, edge] of Object.entries(graph.edges)) {
    if (ids.has(edge.from) || ids.has(edge.to)) Reflect.deleteProperty(graph.edges, id);
  }
  if (ports.size === 0) return;
  for (const outer of allGraphs(document)) {
    const isInstance = (nodeId: string) => {
      const node = outer.nodes[nodeId];
      return node?.kind === "instance" && node.blueprint === scope;
    };
    for (const [id, edge] of Object.entries(outer.edges)) {
      const throughFrom = edge.fromPort !== undefined && ports.has(edge.fromPort) && isInstance(edge.from);
      const throughTo = edge.toPort !== undefined && ports.has(edge.toPort) && isInstance(edge.to);
      if (throughFrom || throughTo) Reflect.deleteProperty(outer.edges, id);
    }
  }
}

function graphOf(document: Document, scope: string): Graph | undefined {
  return scope === "root" ? document.graph : document.blueprints[scope]?.graph;
}

function allGraphs(document: Document): Graph[] {
  return [document.graph, ...Object.values(document.blueprints).map((blueprint) => blueprint.graph)];
}

/** The ids of an instance node's ports in that direction; nothing for other nodes. */
function portsOf(document: Document, node: Node | undefined, direction: "in" | "out"): string[] {
  if (node?.kind !== "instance") return [];
  const nodes = document.blueprints[node.blueprint]?.graph.nodes ?? {};
  return Object.keys(nodes).filter((id) => {
    const port = nodes[id];
    return port?.kind === "port" && port.direction === direction;
  });
}

/** Whether placing `blueprint` into the graph `scope` would make a blueprint contain itself. */
function contains(document: Document, blueprint: string, scope: string, seen: Set<string>): boolean {
  if (blueprint === scope) return true;
  if (seen.has(blueprint)) return false;
  seen.add(blueprint);
  const nodes = Object.values(document.blueprints[blueprint]?.graph.nodes ?? {});
  return nodes.some((node) => node.kind === "instance" && contains(document, node.blueprint, scope, seen));
}

function issue(path: Issue["path"], message: string): Issue {
  return { path, message };
}
