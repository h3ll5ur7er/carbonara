// Hides how a document graph and its pack become what the canvas draws: renderer-neutral node and edge
// views with names resolved from the pack and fixed geometry. Every CanvasAdapter draws from these.
import type { Graph, LocalId, Node, Position, TagColour } from "../../../contracts/document";
import type { Id, Item, ItemForm, PackData, Recipe } from "../../../contracts/pack";
import {
  FRAME_SIZE,
  JUNCTION_SIZE,
  NOTE_SIZE,
  RECIPE_WIDTH,
  TERMINAL_HEIGHT,
  TERMINAL_WIDTH,
  portRowCentre,
  recipeHeight,
} from "./geometry";

export type PortDirection = "in" | "out";

export interface ItemView {
  id: Id;
  name: string;
  form: ItemForm;
}

export interface PortView {
  /** Unique within the node; edges attach to it. */
  handle: string;
  direction: PortDirection;
  item: ItemView;
  /** Where the port sits on the node's border, relative to its top-left corner. */
  x: number;
  y: number;
}

interface NodeViewBase {
  id: LocalId;
  position: { x: number; y: number };
  width: number;
  height: number;
  ports: PortView[];
  /** Locked nodes can't be dragged, nudged or arranged. */
  locked?: true;
  /** The colour tag the user gave it. */
  tag?: TagColour;
}

export type NodeView = NodeViewBase &
  (
    | { kind: "recipe"; recipe: Id; title: string; building: { id: Id; name: string }; alternate: boolean }
    | { kind: "source"; item: ItemView; maxPerSecond?: number }
    | { kind: "sink"; item: ItemView; targetPerSecond?: number }
    | { kind: "junction"; item?: ItemView }
    | { kind: "note"; text: string }
    | { kind: "frame"; label: string; tone?: string }
    /** Kinds the canvas does not draw yet (subgraph instances and ports). */
    | { kind: "placeholder"; label: string }
  );

export type NodeViewKind = NodeView["kind"];

export interface EdgeView {
  id: LocalId;
  source: LocalId;
  target: LocalId;
  sourceHandle: string;
  targetHandle: string;
  item: Id;
}

export interface CanvasScene {
  /** Frames first, so they sit behind everything else. */
  nodes: NodeView[];
  edges: EdgeView[];
}

/** The handle of an item port. Junctions carry any item and use the bare direction. */
export function handleId(direction: PortDirection, item: Id): string {
  return `${direction}:${item}`;
}

interface PackIndex {
  items: Map<Id, Item>;
  recipes: Map<Id, Recipe>;
  buildings: Map<Id, string>;
}

const packIndexes = new WeakMap<PackData, PackIndex>();

function indexPack(pack: PackData): PackIndex {
  let index = packIndexes.get(pack);
  if (!index) {
    index = {
      items: new Map(pack.items.map((item) => [item.id, item])),
      recipes: new Map(pack.recipes.map((recipe) => [recipe.id, recipe])),
      buildings: new Map(pack.buildings.map((building) => [building.id, building.name])),
    };
    packIndexes.set(pack, index);
  }
  return index;
}

function itemView(index: PackIndex, id: Id): ItemView {
  const item = index.items.get(id);
  return { id, name: item?.name ?? id, form: item?.form ?? "solid" };
}

type Positions = Record<LocalId, Position> | undefined;

interface CacheEntry {
  node: Node;
  position: Position | undefined;
  pack: PackData;
  junctionItem: Id | undefined;
  view: NodeView;
}

/**
 * Returns a function that builds the scene and reuses the view of every node whose document node, position
 * and pack are unchanged. Documents change through Immer, so unchanged nodes keep their identity.
 */
export function createSceneBuilder() {
  let cache = new Map<LocalId, CacheEntry>();

  return function buildScene(graph: Graph, positions: Positions, pack: PackData): CanvasScene {
    const index = indexPack(pack);
    const junctionItems = junctionItemsOf(graph);
    const next = new Map<LocalId, CacheEntry>();
    const frames: NodeView[] = [];
    const others: NodeView[] = [];

    for (const [id, node] of Object.entries(graph.nodes)) {
      const position = positions?.[id];
      const junctionItem = junctionItems.get(id);
      const cached = cache.get(id);
      const view =
        cached &&
        cached.node === node &&
        cached.position === position &&
        cached.pack === pack &&
        cached.junctionItem === junctionItem
          ? cached.view
          : decorated(position, nodeView(id, node, position, index, junctionItem));
      next.set(id, { node, position, pack, junctionItem, view });
      (view.kind === "frame" ? frames : others).push(view);
    }
    cache = next;

    const views = new Map([...frames, ...others].map((view) => [view.id, view]));
    const edges: EdgeView[] = [];
    for (const [id, edge] of Object.entries(graph.edges)) {
      const source = views.get(edge.from);
      const target = views.get(edge.to);
      const sourceHandle = source && portFor(source, "out", edge.item);
      const targetHandle = target && portFor(target, "in", edge.item);
      if (!sourceHandle || !targetHandle) continue;
      edges.push({ id, source: edge.from, target: edge.to, sourceHandle, targetHandle, item: edge.item });
    }
    return { nodes: [...frames, ...others], edges };
  };
}

function portFor(view: NodeView, direction: PortDirection, item: Id): string | undefined {
  if (view.kind === "junction") return direction;
  return view.ports.find((port) => port.direction === direction && port.item.id === item)?.handle;
}

/** The item a junction carries: that of its first edge. */
function junctionItemsOf(graph: Graph): Map<LocalId, Id> {
  const items = new Map<LocalId, Id>();
  for (const edge of Object.values(graph.edges)) {
    for (const end of [edge.from, edge.to]) {
      if (graph.nodes[end]?.kind === "junction" && !items.has(end)) items.set(end, edge.item);
    }
  }
  return items;
}

function nodeView(
  id: LocalId,
  node: Node,
  position: Position | undefined,
  index: PackIndex,
  junctionItem: Id | undefined,
): NodeView {
  const at = { x: position?.x ?? 0, y: position?.y ?? 0 };
  switch (node.kind) {
    case "recipe": {
      const recipe = index.recipes.get(node.recipe);
      const buildingId = node.building ?? recipe?.buildings[0] ?? "";
      const inputs = Object.keys(recipe?.in ?? {});
      const outputs = Object.keys(recipe?.out ?? {});
      const width = RECIPE_WIDTH;
      const ports = [
        ...inputs.map((item, row) => port("in", itemView(index, item), 0, portRowCentre(row))),
        ...outputs.map((item, row) => port("out", itemView(index, item), width, portRowCentre(inputs.length + row))),
      ];
      const firstOutput = outputs[0];
      const title = recipe?.name ?? (firstOutput ? itemView(index, firstOutput).name : node.recipe);
      return {
        id,
        kind: "recipe",
        recipe: node.recipe,
        title,
        building: { id: buildingId, name: index.buildings.get(buildingId) ?? buildingId },
        alternate: recipe?.tags?.includes("alternate") ?? false,
        position: at,
        width,
        height: recipeHeight(inputs.length + outputs.length),
        ports,
      };
    }
    case "source": {
      const item = itemView(index, node.item);
      return {
        id,
        kind: "source",
        item,
        ...(node.maxPerSecond !== undefined && { maxPerSecond: node.maxPerSecond }),
        position: at,
        width: TERMINAL_WIDTH,
        height: TERMINAL_HEIGHT,
        ports: [port("out", item, TERMINAL_WIDTH, TERMINAL_HEIGHT / 2)],
      };
    }
    case "sink": {
      const item = itemView(index, node.item);
      return {
        id,
        kind: "sink",
        item,
        ...(node.targetPerSecond !== undefined && { targetPerSecond: node.targetPerSecond }),
        position: at,
        width: TERMINAL_WIDTH,
        height: TERMINAL_HEIGHT,
        ports: [port("in", item, 0, TERMINAL_HEIGHT / 2)],
      };
    }
    case "junction": {
      const item = junctionItem ? itemView(index, junctionItem) : undefined;
      const anyItem: ItemView = item ?? { id: "", name: "Any item", form: "solid" };
      return {
        id,
        kind: "junction",
        ...(item && { item }),
        position: at,
        width: JUNCTION_SIZE,
        height: JUNCTION_SIZE,
        ports: [
          { ...port("in", anyItem, 0, JUNCTION_SIZE / 2), handle: "in" },
          { ...port("out", anyItem, JUNCTION_SIZE, JUNCTION_SIZE / 2), handle: "out" },
        ],
      };
    }
    case "note":
      return {
        id,
        kind: "note",
        text: node.text,
        position: at,
        width: position?.width ?? NOTE_SIZE.width,
        height: position?.height ?? NOTE_SIZE.height,
        ports: [],
      };
    case "frame":
      return {
        id,
        kind: "frame",
        label: node.label,
        ...(node.tone !== undefined && { tone: node.tone }),
        position: at,
        width: position?.width ?? FRAME_SIZE.width,
        height: position?.height ?? FRAME_SIZE.height,
        ports: [],
      };
    case "instance":
    case "port":
      return {
        id,
        kind: "placeholder",
        label: node.kind === "instance" ? node.blueprint : node.item,
        position: at,
        width: TERMINAL_WIDTH,
        height: TERMINAL_HEIGHT,
        ports: [],
      };
  }
}

/** What the user set on the position besides where it is: a lock, a colour tag. */
function decorated(position: Position | undefined, view: NodeView): NodeView {
  if (!position?.locked && !position?.tag) return view;
  return { ...view, ...(position.locked && { locked: true }), ...(position.tag && { tag: position.tag }) };
}

function port(direction: PortDirection, item: ItemView, x: number, y: number): PortView {
  return { handle: handleId(direction, item.id), direction, item, x, y };
}
