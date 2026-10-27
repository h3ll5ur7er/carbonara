// What the blueprint library lists: each blueprint of the document with what goes in and comes out, how often it's
// placed, and whether it can be placed in the graph on screen (never inside itself).
import type { Document, LocalId } from "../../../contracts/document";
import type { PackData } from "../../../contracts/pack";
import { boundaryPorts, type ItemView } from "../../canvas/model/scene";
import { instancesOf } from "./path";

export interface LibraryEntry {
  id: LocalId;
  name: string;
  /** The items of its input and output ports, in the order they sit inside. */
  inputs: ItemView[];
  outputs: ItemView[];
  instances: number;
  /** Nodes inside, ports left out. */
  nodes: number;
  /** False where placing it would put a blueprint inside itself. */
  placeable: boolean;
}

export function libraryEntries(document: Document, pack: PackData, graph: string): LibraryEntry[] {
  const items = new Map(pack.items.map((item) => [item.id, item]));
  const itemView = (id: string): ItemView => {
    const item = items.get(id);
    return { id, name: item?.name ?? id, form: item?.form ?? "solid" };
  };
  return Object.entries(document.blueprints)
    .map(([id, blueprint]) => {
      const layout = document.layout[id];
      const portItems = (direction: "in" | "out") =>
        boundaryPorts(blueprint, layout, direction).map(({ node }) => itemView(node.item));
      return {
        id,
        name: blueprint.name,
        inputs: portItems("in"),
        outputs: portItems("out"),
        instances: instancesOf(document, id),
        nodes: Object.values(blueprint.graph.nodes).filter((node) => node.kind !== "port").length,
        placeable: !contains(document, id, graph, new Set()),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
}

/** Whether `blueprint` is `scope` or places it, however deep. */
function contains(document: Document, blueprint: LocalId, scope: string, seen: Set<LocalId>): boolean {
  if (blueprint === scope) return true;
  if (seen.has(blueprint)) return false;
  seen.add(blueprint);
  return Object.values(document.blueprints[blueprint]?.graph.nodes ?? {}).some(
    (node) => node.kind === "instance" && contains(document, node.blueprint, scope, seen),
  );
}
