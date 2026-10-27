// Editing engine: how graphs are edited. Applies a batch of commands to a document as one step and returns the
// Immer patches and inverse patches that redo and undo it. Invalid edits are rejected as values, and the whole
// batch with them. Pure: ids of new nodes and edges arrive with the commands; the manager chooses them.
import { applyPatches as applyImmerPatches, enablePatches, produceWithPatches } from "immer";
import type { Command } from "../../contracts/commands";
import type { Document, Edge, Graph, Node } from "../../contracts/document";
import type { Issue } from "../../contracts/issues";
import type { Patch } from "../../contracts/patches";
import { fail, ok, type Result } from "../../contracts/result";
import { allGraphs, contains, freeId, graphOf, issue, portsOf } from "./graphs";
import { addBlueprint, collapse, expand } from "./subgraphs";
import { own } from "../../utilities/records";

// Immer's patch support is opt-in; enabling it twice is harmless.
enablePatches();

type WithId<C> = C extends { type: "addNode" | "connect" | "addBlueprint" }
  ? Omit<C, "id"> & { id: string }
  : C extends { type: "collapse" }
    ? Omit<C, "blueprint" | "instance"> & { blueprint: string; instance: string }
    : C;
/** A command whose new node, edge or blueprint already has its id. */
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
  setPluginSettings: "Change save profile",
  setRate: "Change rate",
  setLocked: "Lock nodes",
  setCollapsed: "Collapse frames",
  removeAndBridge: "Delete and bridge",
  setSettings: "Change settings",
  setRecipe: "Change recipe",
  setLogistics: "Change belt",
  setText: "Change text",
  setTag: "Tag nodes",
  collapse: "Collapse into subgraph",
  expand: "Expand subgraph",
  renameBlueprint: "Rename blueprint",
  addBlueprint: "Add blueprint",
  removeBlueprint: "Delete blueprint",
  renameDocument: "Rename factory",
};

/** A name for the history when the caller gives none. */
export function describeCommands(commands: Command[]): string {
  const types = new Set(commands.map((command) => command.type));
  const [only] = types;
  return types.size === 1 && only ? LABELS[only] : "Edit";
}

/** Mutates the draft, or returns the problem (relative to the command) without touching it. */
function applyCommand(document: Document, command: ResolvedCommand): Issue | undefined {
  if (command.type === "setPluginSettings") {
    const settings = (document.settings.plugin ??= {});
    for (const [key, value] of Object.entries(command.settings)) {
      if (value === null) Reflect.deleteProperty(settings, key);
      else settings[key] = structuredClone(value);
    }
    return;
  }
  if (command.type === "setSettings") {
    for (const [key, value] of Object.entries(command.settings)) {
      if (value === null) Reflect.deleteProperty(document.settings, key);
      else if (value !== undefined && document.settings[key as keyof Document["settings"]] !== value) {
        Object.assign(document.settings, { [key]: value });
      }
    }
    return;
  }
  if (command.type === "renameBlueprint") {
    const blueprint = own(document.blueprints, command.blueprint);
    if (!blueprint) return issue(["blueprint"], `Unknown blueprint ${command.blueprint}`);
    blueprint.name = command.name;
    return;
  }
  if (command.type === "renameDocument") {
    if (document.name !== command.name) document.name = command.name;
    return;
  }
  if (command.type === "addBlueprint") return addBlueprint(document, command);
  if (command.type === "removeBlueprint") {
    if (!own(document.blueprints, command.blueprint)) {
      return issue(["blueprint"], `Unknown blueprint ${command.blueprint}`);
    }
    removeBlueprint(document, command.blueprint);
    return;
  }
  const scope = command.graph;
  const graph = graphOf(document, scope);
  if (!graph) return issue(["graph"], `Unknown graph ${scope}`);

  switch (command.type) {
    case "collapse":
      return collapse(document, scope, graph, command);
    case "expand":
      return expand(document, scope, graph, command);
    case "addNode": {
      if (own(graph.nodes, command.id)) return issue(["id"], `Node ${command.id} already exists`);
      const problem = checkNode(document, scope, command.node);
      if (problem) return problem;
      graph.nodes[command.id] = structuredClone(command.node);
      (document.layout[scope] ??= {})[command.id] = structuredClone(command.position);
      return;
    }
    case "removeNodes": {
      for (const [index, id] of command.ids.entries()) {
        if (!own(graph.nodes, id)) return issue(["ids", index], `Unknown node ${id}`);
      }
      removeNodes(document, scope, graph, new Set(command.ids));
      return;
    }
    case "removeAndBridge": {
      for (const [index, id] of command.ids.entries()) {
        if (!own(graph.nodes, id)) return issue(["ids", index], `Unknown node ${id}`);
      }
      const removed = new Set(command.ids);
      const bridges = bridgesAround(graph, removed);
      removeNodes(document, scope, graph, removed);
      for (const [id, edge] of bridges) graph.edges[freeId((taken) => Object.hasOwn(graph.edges, taken), id)] = edge;
      return;
    }
    case "connect": {
      const { id, edge } = command;
      if (own(graph.edges, id)) return issue(["id"], `Edge ${id} already exists`);
      for (const end of ["from", "to"] as const) {
        if (!own(graph.nodes, edge[end])) return issue(["edge", end], `Unknown node ${edge[end]}`);
      }
      if (
        edge.fromPort !== undefined &&
        !portsOf(document, own(graph.nodes, edge.from), "out").includes(edge.fromPort)
      ) {
        return issue(["edge", "fromPort"], `${edge.from} has no out port ${edge.fromPort}`);
      }
      if (edge.toPort !== undefined && !portsOf(document, own(graph.nodes, edge.to), "in").includes(edge.toPort)) {
        return issue(["edge", "toPort"], `${edge.to} has no in port ${edge.toPort}`);
      }
      graph.edges[id] = structuredClone(edge);
      return;
    }
    case "disconnect": {
      for (const [index, id] of command.ids.entries()) {
        if (!own(graph.edges, id)) return issue(["ids", index], `Unknown edge ${id}`);
      }
      for (const id of command.ids) Reflect.deleteProperty(graph.edges, id);
      return;
    }
    case "moveNodes": {
      const positions = Object.entries(command.positions);
      for (const [id] of positions) {
        if (!own(graph.nodes, id)) return issue(["positions", id], `Unknown node ${id}`);
      }
      for (const [id, position] of positions) (document.layout[scope] ??= {})[id] = structuredClone(position);
      return;
    }
    case "setNodeFields":
    case "setPin": {
      const node = own(graph.nodes, command.id);
      if (!node) return issue(["id"], `Unknown node ${command.id}`);
      if (node.kind !== "recipe") return issue(["id"], `${command.id} is not a recipe node`);
      if (command.type === "setNodeFields") Object.assign((node.fields ??= {}), command.fields);
      else if (command.pin === null) delete node.pin;
      else node.pin = structuredClone(command.pin);
      return;
    }
    case "setRate": {
      const node = own(graph.nodes, command.id);
      if (!node) return issue(["id"], `Unknown node ${command.id}`);
      if (node.kind !== "source" && node.kind !== "sink") {
        return issue(["id"], `${command.id} is neither a source nor a sink`);
      }
      const key = node.kind === "source" ? "maxPerSecond" : "targetPerSecond";
      if (command.perSecond === null) Reflect.deleteProperty(node, key);
      else Object.assign(node, { [key]: command.perSecond });
      return;
    }
    case "setRecipe": {
      for (const [index, id] of command.ids.entries()) {
        const node = own(graph.nodes, id);
        if (!node) return issue(["ids", index], `Unknown node ${id}`);
        if (node.kind !== "recipe") return issue(["ids", index], `${id} is not a recipe node`);
      }
      for (const id of command.ids) {
        const node = own(graph.nodes, id);
        if (node?.kind !== "recipe") continue;
        node.recipe = command.recipe;
        if (command.building !== undefined) node.building = command.building;
        else delete node.building;
      }
      return;
    }
    case "setText": {
      const node = own(graph.nodes, command.id);
      if (!node) return issue(["id"], `Unknown node ${command.id}`);
      if (node.kind === "note") node.text = command.text;
      else if (node.kind === "frame") node.label = command.text;
      else return issue(["id"], `${command.id} is neither a note nor a frame`);
      return;
    }
    case "setTag": {
      for (const [index, id] of command.ids.entries()) {
        if (!own(graph.nodes, id)) return issue(["ids", index], `Unknown node ${id}`);
      }
      for (const id of command.ids) {
        const position = document.layout[scope]?.[id];
        if (command.tag === null) {
          if (position?.tag !== undefined) delete position.tag;
        } else if (position?.tag !== command.tag) {
          (document.layout[scope] ??= {})[id] = { ...(position ?? { x: 0, y: 0 }), tag: command.tag };
        }
      }
      return;
    }
    case "setLogistics": {
      for (const [index, id] of command.ids.entries()) {
        if (!own(graph.edges, id)) return issue(["ids", index], `Unknown edge ${id}`);
      }
      for (const id of command.ids) {
        const edge = own(graph.edges, id);
        if (!edge) continue;
        if (command.logistics === null) delete edge.logistics;
        else edge.logistics = command.logistics;
      }
      return;
    }
    case "setCollapsed": {
      for (const [index, id] of command.ids.entries()) {
        const node = own(graph.nodes, id);
        if (!node) return issue(["ids", index], `Unknown node ${id}`);
        if (node.kind !== "frame") return issue(["ids", index], `${id} is not a frame`);
      }
      for (const id of command.ids) {
        const node = own(graph.nodes, id);
        if (node?.kind !== "frame") continue;
        if (command.collapsed && !node.collapsed) node.collapsed = true;
        else if (!command.collapsed && node.collapsed) delete node.collapsed;
      }
      return;
    }
    case "setLocked": {
      for (const [index, id] of command.ids.entries()) {
        if (!own(graph.nodes, id)) return issue(["ids", index], `Unknown node ${id}`);
      }
      for (const id of command.ids) {
        const position = document.layout[scope]?.[id];
        if (command.locked && !position?.locked) {
          (document.layout[scope] ??= {})[id] = { ...(position ?? { x: 0, y: 0 }), locked: true };
        } else if (!command.locked && position?.locked) Reflect.deleteProperty(position, "locked");
      }
      return;
    }
  }
}

function checkNode(document: Document, scope: string, node: Node): Issue | undefined {
  if (node.kind === "port" && scope === "root") return issue(["node", "kind"], "Ports only exist inside blueprints");
  if (node.kind !== "instance") return;
  if (!own(document.blueprints, node.blueprint))
    return issue(["node", "blueprint"], `Unknown blueprint ${node.blueprint}`);
  if (contains(document, node.blueprint, scope)) {
    return issue(["node", "blueprint"], `Blueprint ${node.blueprint} can't contain itself`);
  }
}

/** Removes a blueprint, its layout and every instance of it in the other graphs (with their flows and positions). */
function removeBlueprint(document: Document, blueprint: string): void {
  for (const scope of ["root", ...Object.keys(document.blueprints)]) {
    const graph = scope === blueprint ? undefined : graphOf(document, scope);
    if (!graph) continue;
    const placed = Object.keys(graph.nodes).filter((id) => {
      const node = own(graph.nodes, id);
      return node?.kind === "instance" && node.blueprint === blueprint;
    });
    if (placed.length > 0) removeNodes(document, scope, graph, new Set(placed));
  }
  Reflect.deleteProperty(document.blueprints, blueprint);
  Reflect.deleteProperty(document.layout, blueprint);
}

/** Removes the nodes with their positions and edges, including edges that reach a removed port from outside. */
function removeNodes(document: Document, scope: string, graph: Graph, ids: Set<string>): void {
  const ports = new Set([...ids].filter((id) => own(graph.nodes, id)?.kind === "port"));
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
      const node = own(outer.nodes, nodeId);
      return node?.kind === "instance" && node.blueprint === scope;
    };
    for (const [id, edge] of Object.entries(outer.edges)) {
      const throughFrom = edge.fromPort !== undefined && ports.has(edge.fromPort) && isInstance(edge.from);
      const throughTo = edge.toPort !== undefined && ports.has(edge.toPort) && isInstance(edge.to);
      if (throughFrom || throughTo) Reflect.deleteProperty(outer.edges, id);
    }
  }
}

/**
 * The flows that keep a graph connected once `removed` is gone: per item, every flow into a group of removed
 * nodes joined by that item's flows, connected to every flow out of it. Never a duplicate or a loop.
 */
function bridgesAround(graph: Graph, removed: Set<string>): [string, Edge][] {
  const entries = Object.entries(graph.edges);
  // The removed node each removed node's group is named after, per item: a small union-find.
  const groups = new Map<string, string>();
  const groupOf = (item: string, node: string): string => {
    const key = `${item}\u0000${node}`;
    const parent = groups.get(key) ?? node;
    if (parent === node) return node;
    const root = groupOf(item, parent);
    groups.set(key, root);
    return root;
  };
  for (const [, edge] of entries) {
    if (removed.has(edge.from) && removed.has(edge.to)) {
      groups.set(`${edge.item}\u0000${groupOf(edge.item, edge.from)}`, groupOf(edge.item, edge.to));
    }
  }

  const exists = (edge: Edge) =>
    Object.values(graph.edges).some(
      (other) =>
        other.from === edge.from &&
        other.to === edge.to &&
        other.item === edge.item &&
        other.fromPort === edge.fromPort &&
        other.toPort === edge.toPort,
    );
  const bridges: [string, Edge][] = [];
  for (const [inId, into] of entries) {
    if (removed.has(into.from) || !removed.has(into.to)) continue;
    for (const [outId, out] of entries) {
      if (!removed.has(out.from) || removed.has(out.to) || out.item !== into.item) continue;
      if (groupOf(into.item, into.to) !== groupOf(out.item, out.from)) continue;
      if (into.from === out.to) continue;
      const bridge: Edge = {
        from: into.from,
        to: out.to,
        ...(into.fromPort !== undefined && { fromPort: into.fromPort }),
        ...(out.toPort !== undefined && { toPort: out.toPort }),
        item: into.item,
        ...(into.logistics !== undefined && into.logistics === out.logistics && { logistics: into.logistics }),
      };
      const duplicate = exists(bridge) || bridges.some(([, other]) => JSON.stringify(other) === JSON.stringify(bridge));
      if (!duplicate) bridges.push([`${inId}+${outId}`, bridge]);
    }
  }
  return bridges;
}
