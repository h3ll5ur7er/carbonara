// Hides how a document graph and its pack become what the canvas draws: renderer-neutral node and edge
// views with names resolved from the pack and fixed geometry. Every CanvasAdapter draws from these.
import type { Graph, LocalId, Node, Position, TagColour } from "../../../contracts/document";
import type { Id, Item, ItemForm, PackData, Recipe } from "../../../contracts/pack";
import {
  COLLAPSED_FRAME_HEIGHT,
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

/** The edge of the node a port sits on: flows run left to right, or (`flow: "down"`) top to bottom. */
export type PortSide = "left" | "right" | "top" | "bottom";

export interface PortView {
  /** Unique within the node; edges attach to it. */
  handle: string;
  direction: PortDirection;
  item: ItemView;
  /** Where the port sits on the node's border, relative to its top-left corner. */
  x: number;
  y: number;
  side: PortSide;
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
  /** Inside this collapsed frame: not drawn, its flows drawn to the frame's bar instead. */
  hiddenBy?: LocalId;
}

export type NodeView = NodeViewBase &
  (
    | { kind: "recipe"; recipe: Id; title: string; building: { id: Id; name: string }; alternate: boolean }
    | { kind: "source"; item: ItemView; maxPerSecond?: number }
    | { kind: "sink"; item: ItemView; targetPerSecond?: number }
    | { kind: "junction"; item?: ItemView }
    | { kind: "note"; text: string }
    /** `members`: collapsed to its label bar, hiding that many nodes. */
    | { kind: "frame"; label: string; tone?: string; members?: number }
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
          : decorated(position, oriented(position?.flow, nodeView(id, node, position, index, junctionItem)));
      next.set(id, { node, position, pack, junctionItem, view });
      (view.kind === "frame" ? frames : others).push(view);
    }
    cache = next;

    const { nodes, hiddenBy } = fold([...frames, ...others], graph);
    const views = new Map(nodes.map((view) => [view.id, view]));
    const edges: EdgeView[] = [];
    for (const [id, edge] of Object.entries(graph.edges)) {
      // A flow into or out of a collapsed frame's nodes runs to its bar; one within the frame isn't drawn.
      const from = hiddenBy.get(edge.from);
      const to = hiddenBy.get(edge.to);
      if (from && from === to) continue;
      const source = views.get(from ?? edge.from);
      const target = views.get(to ?? edge.to);
      const sourceHandle = from ? "out" : source && portFor(source, "out", edge.item);
      const targetHandle = to ? "in" : target && portFor(target, "in", edge.item);
      if (!source || !target || !sourceHandle || !targetHandle) continue;
      edges.push({ id, source: source.id, target: target.id, sourceHandle, targetHandle, item: edge.item });
    }
    return { nodes, edges };
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

/**
 * Collapsed frames folded to their label bar, with an input on its left end and an output on its right that the
 * flows of the nodes it holds run to. A node is held by the largest collapsed frame larger than itself that its
 * centre lies in (a frame inside another collapsed one is held too); held nodes stay in the scene, marked
 * `hiddenBy`.
 */
function fold(views: NodeView[], graph: Graph): { nodes: NodeView[]; hiddenBy: Map<LocalId, LocalId> } {
  const hiddenBy = new Map<LocalId, LocalId>();
  const collapsed = views
    .filter((view) => {
      const node = graph.nodes[view.id];
      return node?.kind === "frame" && node.collapsed;
    })
    .sort((a, b) => b.width * b.height - a.width * a.height);
  if (collapsed.length === 0) return { nodes: views, hiddenBy };
  for (const view of views) {
    const x = view.position.x + view.width / 2;
    const y = view.position.y + view.height / 2;
    const frame = collapsed.find(
      (candidate) =>
        candidate.width * candidate.height > view.width * view.height &&
        x >= candidate.position.x &&
        x <= candidate.position.x + candidate.width &&
        y >= candidate.position.y &&
        y <= candidate.position.y + candidate.height,
    );
    if (frame) hiddenBy.set(view.id, frame.id);
  }
  const members = new Map<LocalId, number>();
  for (const frame of hiddenBy.values()) members.set(frame, (members.get(frame) ?? 0) + 1);
  const anyItem: ItemView = { id: "", name: "Any item", form: "solid" };
  const nodes = views.map((view): NodeView => {
    const frame = hiddenBy.get(view.id);
    if (frame) return { ...view, hiddenBy: frame };
    if (view.kind !== "frame" || !collapsed.includes(view)) return view;
    const middle = COLLAPSED_FRAME_HEIGHT / 2;
    return {
      ...view,
      height: COLLAPSED_FRAME_HEIGHT,
      members: members.get(view.id) ?? 0,
      ports: [
        { ...port("in", anyItem, 0, middle), handle: "in" },
        { ...port("out", anyItem, view.width, middle), handle: "out" },
      ],
    };
  });
  return { nodes, hiddenBy };
}

/** What the user set on the position besides where it is: a lock, a colour tag. */
function decorated(position: Position | undefined, view: NodeView): NodeView {
  if (!position?.locked && !position?.tag) return view;
  return { ...view, ...(position.locked && { locked: true }), ...(position.tag && { tag: position.tag }) };
}

function port(direction: PortDirection, item: ItemView, x: number, y: number): PortView {
  return { handle: handleId(direction, item.id), direction, item, x, y, side: direction === "in" ? "left" : "right" };
}

/**
 * A node whose flows run down (arranged top to bottom) takes them in along its top edge and gives them out along
 * its bottom edge, each side's ports spread evenly in their order.
 */
function oriented(flow: Position["flow"], view: NodeView): NodeView {
  if (flow !== "down" || view.ports.length === 0) return view;
  const spread = (direction: PortDirection): PortView[] => {
    const own = view.ports.filter((candidate) => candidate.direction === direction);
    return own.map((candidate, index) => ({
      ...candidate,
      x: (view.width * (index + 1)) / (own.length + 1),
      y: direction === "in" ? 0 : view.height,
      side: direction === "in" ? "top" : "bottom",
    }));
  };
  return { ...view, ports: [...spread("in"), ...spread("out")] };
}
