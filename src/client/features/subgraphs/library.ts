// What the blueprint library lists: each blueprint of the document with what goes in and comes out, how often it's
// placed, and whether it can be placed in the graph on screen (never inside itself); and the edits its cards make
// (duplicate, delete).
import type { CommandInput } from "../../../contracts/commands";
import type { Document, LocalId } from "../../../contracts/document";
import type { PackData } from "../../../contracts/pack";
import { own } from "../../../utilities/records";
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

/** An edit for the editing manager, with how it reads in the history. */
export interface BlueprintEdit {
  commands: CommandInput[];
  label: string;
}

/**
 * A copy of a blueprint to start a variant: its insides and layout as a new blueprint (the manager chooses its id),
 * named "… copy" (then "… copy 2" …) so it's told apart. Nothing places it yet.
 */
export function duplicateEdit(document: Document, id: LocalId): BlueprintEdit | undefined {
  const blueprint = own(document.blueprints, id);
  if (!blueprint) return undefined;
  const taken = new Set(Object.values(document.blueprints).map((other) => other.name));
  const base = `${blueprint.name} copy`;
  let name = base;
  for (let suffix = 2; taken.has(name); suffix++) name = `${base} ${suffix}`;
  return {
    commands: [
      { type: "addBlueprint", blueprint: { name, graph: blueprint.graph }, layout: own(document.layout, id) ?? {} },
    ],
    label: `Duplicate ${blueprint.name}`,
  };
}

/** Deletes blueprints, and every instance of them, as one step. */
export function deleteEdit(document: Document, ids: readonly LocalId[]): BlueprintEdit | undefined {
  const [only] = ids;
  if (only === undefined) return undefined;
  return {
    commands: ids.map((blueprint) => ({ type: "removeBlueprint", blueprint })),
    label:
      ids.length === 1 ? `Delete ${own(document.blueprints, only)?.name ?? only}` : `Delete ${ids.length} blueprints`,
  };
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
