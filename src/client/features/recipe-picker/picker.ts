// The recipe picker's rules: which recipes to offer for an item dragged out of a port, in which order, how
// typing narrows them, where the new node goes and which edits create it. Pure, so it's tested without a UI.
import type { CommandInput } from "../../../contracts/commands";
import type { Graph, LocalId, Node } from "../../../contracts/document";
import type { Id, PackData, Recipe } from "../../../contracts/pack";
import { GRID } from "../../canvas/model/geometry";
import type { Connector } from "../../core/connector";
import { createSceneBuilder, handleId, type ItemView } from "../../canvas/model/scene";

/** The item dragged out of a port, and that port's side: an output asks for consumers, an input for producers. */
export interface PickerRequest {
  item: Id;
  side: "in" | "out";
}

export interface ItemRate {
  item: ItemView;
  /** Per machine at the building's speed. */
  perSecond: number;
}

export type PickerEntry =
  | {
      kind: "recipe";
      /** The recipe id. */
      id: string;
      title: string;
      building: string;
      alternate: boolean;
      /** Nodes in the document that already run this recipe. */
      uses: number;
      inputs: ItemRate[];
      outputs: ItemRate[];
      /** Seconds per craft in the building. */
      seconds: number;
      /** Lower-case text that typing is matched against. */
      search: string;
    }
  | { kind: "source" | "sink"; id: string; title: string; item: ItemView; search: string };

/** Counts the nodes running each recipe: how the picker ranks recipes by use. */
export function recipeUsage(graph: Graph): Record<Id, number> {
  const usage: Record<Id, number> = {};
  for (const node of Object.values(graph.nodes)) {
    if (node.kind === "recipe") usage[node.recipe] = (usage[node.recipe] ?? 0) + 1;
  }
  return usage;
}

/** The entries for a request, best first: most used, main product before byproduct, standard before alternate. */
export function pickerEntries(pack: PackData, request: PickerRequest, usage: Record<Id, number>): PickerEntry[] {
  const items = new Map(pack.items.map((item) => [item.id, item]));
  const itemView = (id: Id): ItemView => {
    const item = items.get(id);
    return { id, name: item?.name ?? id, form: item?.form ?? "solid" };
  };
  const itemWords = (item: ItemView) => [item.name, item.id, ...(items.get(item.id)?.aliases ?? [])];
  const search = (words: string[]) => words.join(" ").toLowerCase();
  const buildings = new Map(pack.buildings.map((building) => [building.id, building]));
  const producing = request.side === "in";

  const matches = pack.recipes.filter((recipe) => (producing ? recipe.out : recipe.in)[request.item] !== undefined);
  const recipes = matches
    .map((recipe) => ({ recipe, rank: rank(recipe, request, usage) }))
    .sort((a, b) => compareRanks(a.rank, b.rank))
    .map(({ recipe }): PickerEntry => {
      const building = buildings.get(recipe.buildings[0] ?? "");
      const seconds = recipe.time / (building?.speed ?? 1);
      const rates = (amounts: Record<Id, number>) =>
        Object.entries(amounts).map(([item, amount]) => ({ item: itemView(item), perSecond: amount / seconds }));
      const firstOutput = Object.keys(recipe.out)[0];
      const title = recipe.name ?? (firstOutput ? itemView(firstOutput).name : recipe.id);
      const buildingName = building?.name ?? recipe.buildings[0] ?? "";
      const alternate = recipe.tags?.includes("alternate") ?? false;
      const inputs = rates(recipe.in);
      const outputs = rates(recipe.out);
      const items = [...inputs, ...outputs].flatMap((rate) => itemWords(rate.item));
      return {
        kind: "recipe",
        id: recipe.id,
        title,
        building: buildingName,
        alternate,
        uses: usage[recipe.id] ?? 0,
        inputs,
        outputs,
        seconds,
        search: search([title, recipe.id, buildingName, ...(alternate ? ["alternate"] : []), ...items]),
      };
    });

  const item = itemView(request.item);
  const terminal = (kind: "source" | "sink", title: string): PickerEntry => ({
    kind,
    id: `${kind}:${item.id}`,
    title,
    item,
    search: search([title, kind, ...itemWords(item)]),
  });
  if (!producing) return [...recipes, terminal("sink", `${item.name} output`)];
  const source = terminal("source", `${item.name} source`);
  const raw = pack.resources.some((resource) => resource.item === request.item);
  return raw ? [source, ...recipes] : [...recipes, source];
}

type Rank = [uses: number, mainProduct: number, standard: number, title: string];

function rank(recipe: Recipe, request: PickerRequest, usage: Record<Id, number>): Rank {
  const main = request.side === "in" ? Object.keys(recipe.out)[0] === request.item : true;
  return [usage[recipe.id] ?? 0, main ? 1 : 0, recipe.tags?.includes("alternate") ? 0 : 1, recipe.name ?? recipe.id];
}

function compareRanks(a: Rank, b: Rank): number {
  return b[0] - a[0] || b[1] - a[1] || b[2] - a[2] || a[3].localeCompare(b[3]);
}

/** Narrows the entries to those matching every word typed, keeping their order. */
export function filterEntries(entries: PickerEntry[], text: string): PickerEntry[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return entries;
  return entries.filter((entry) => words.every((word) => entry.search.includes(word)));
}

/** The node an entry adds. */
export function entryNode(entry: PickerEntry): Node {
  if (entry.kind === "recipe") return { kind: "recipe", recipe: entry.id };
  return { kind: entry.kind, item: entry.item.id };
}

export interface Placement {
  x: number;
  y: number;
  width: number;
  /** Where the connecting port ends up: the drop point's height. */
  portY: number;
}

/**
 * Where the new node goes: its connecting port at the drop point, a consumer to the right of it and a producer
 * to the left, snapped to the grid horizontally (vertically the port stays under the pointer).
 */
export function placeNode(
  pack: PackData,
  entry: PickerEntry,
  request: PickerRequest,
  drop: { x: number; y: number },
): Placement {
  const [view] = createSceneBuilder()({ nodes: { new: entryNode(entry) }, edges: {} }, undefined, pack).nodes;
  const side = request.side === "out" ? "in" : "out";
  const port = view?.ports.find((candidate) => candidate.handle === handleId(side, request.item));
  const width = view?.width ?? 0;
  const portX = port?.x ?? (side === "in" ? 0 : width);
  const portY = port?.y ?? (view?.height ?? 0) / 2;
  return { x: Math.round((drop.x - portX) / GRID) * GRID, y: drop.y - portY, width, portY: drop.y };
}

export interface Picked {
  graph: string;
  /** The node and port the drag started from (on a subgraph instance, `port` is the blueprint's port). */
  from: { node: LocalId; item: Id; side: "in" | "out"; port?: LocalId };
  entry: PickerEntry;
  /** The drop point in flow units. */
  drop: { x: number; y: number };
  /** The new node's id. */
  id: LocalId;
}

/** Sends the pick to the editing manager as one labelled batch. */
export function applyPick(
  editing: Pick<Connector["editing"], "apply">,
  documentId: string,
  pack: PackData,
  pick: Picked,
): ReturnType<Connector["editing"]["apply"]> {
  return editing.apply({ documentId, commands: pickCommands(pack, pick), label: `Add ${pick.entry.title}` });
}

/** Adding the node and connecting it, as one batch, so it is one undo step. */
export function pickCommands(pack: PackData, pick: Picked): CommandInput[] {
  const { graph, from, entry, drop, id } = pick;
  const { x, y } = placeNode(pack, entry, from, drop);
  const port = from.port;
  const edge =
    from.side === "out"
      ? { from: from.node, ...(port !== undefined && { fromPort: port }), to: id, item: from.item }
      : { from: id, to: from.node, ...(port !== undefined && { toPort: port }), item: from.item };
  return [
    { type: "addNode", graph, id, node: entryNode(entry), position: { x, y } },
    { type: "connect", graph, edge },
  ];
}
