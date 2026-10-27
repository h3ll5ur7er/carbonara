// Small lookups the editing engine's rules share: which graph a scope names, an instance's ports, whether a
// blueprint would contain itself, free ids.
import type { Document, Graph, Node } from "../../contracts/document";
import type { Issue } from "../../contracts/issues";
import { own } from "../../utilities/records";

export function graphOf(document: Document, scope: string): Graph | undefined {
  return scope === "root" ? document.graph : own(document.blueprints, scope)?.graph;
}

export function allGraphs(document: Document): Graph[] {
  return [document.graph, ...Object.values(document.blueprints).map((blueprint) => blueprint.graph)];
}

/** The ids of an instance node's ports in that direction; nothing for other nodes. */
export function portsOf(document: Document, node: Node | undefined, direction: "in" | "out"): string[] {
  if (node?.kind !== "instance") return [];
  const nodes = own(document.blueprints, node.blueprint)?.graph.nodes ?? {};
  return Object.keys(nodes).filter((id) => {
    const port = nodes[id];
    return port?.kind === "port" && port.direction === direction;
  });
}

/** Whether placing `blueprint` into the graph `scope` would make a blueprint contain itself. */
export function contains(document: Document, blueprint: string, scope: string, seen = new Set<string>()): boolean {
  if (blueprint === scope) return true;
  if (seen.has(blueprint)) return false;
  seen.add(blueprint);
  const nodes = Object.values(own(document.blueprints, blueprint)?.graph.nodes ?? {});
  return nodes.some((node) => node.kind === "instance" && contains(document, node.blueprint, scope, seen));
}

/** `id`, or `id~2`, `id~3` … when it's taken. */
export function freeId(taken: (id: string) => boolean, id: string): string {
  let candidate = id;
  for (let suffix = 2; taken(candidate); suffix++) candidate = `${id}~${suffix}`;
  return candidate;
}

export function issue(path: Issue["path"], message: string): Issue {
  return { path, message };
}
