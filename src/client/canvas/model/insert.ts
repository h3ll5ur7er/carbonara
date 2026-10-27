// Hides how a node dropped onto a flow is spliced into it: which flow it lands on, and which edits put it in
// between (the flow's producer feeds the node, the node feeds the flow's consumer). A node fits when it takes
// the flow's item and makes something the consumer takes; otherwise nothing is inserted.
import type { CommandInput } from "../../../contracts/commands";
import type { Edge, LocalId } from "../../../contracts/document";
import type { Id } from "../../../contracts/pack";
import type { Point } from "../adapter";
import { flowPoints, isBackward } from "./edge-path";
import type { CanvasScene, NodeView } from "./scene";
import type { Rect } from "./snap";

/** Points sampled along each flow when looking for the one under a node. */
const SAMPLES = 24;

/** The flow `node` fits into whose line passes under `rect` (where the node is being dragged). */
export function edgeUnder(rect: Rect, scene: CanvasScene, node: NodeView): LocalId | undefined {
  const views = new Map(scene.nodes.map((view) => [view.id, view]));
  const inside = (point: Point) =>
    point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
  for (const edge of scene.edges) {
    if (edge.source === node.id || edge.target === node.id) continue;
    const consumer = views.get(edge.target);
    if (!consumer || insertedItem(node, edge.item, consumer) === undefined) continue;
    const source = portPoint(views.get(edge.source), edge.sourceHandle);
    const target = portPoint(views.get(edge.target), edge.targetHandle);
    // Loops back run below their nodes; nothing is dropped onto them.
    if (!source || !target || isBackward(source.x, target.x)) continue;
    const box = {
      x: Math.min(source.x, target.x),
      y: Math.min(source.y, target.y),
      right: Math.max(source.x, target.x),
      bottom: Math.max(source.y, target.y),
    };
    if (box.x > rect.x + rect.width || box.right < rect.x || box.y > rect.y + rect.height || box.bottom < rect.y) {
      continue;
    }
    const ends = { sourceX: source.x, sourceY: source.y, targetX: target.x, targetY: target.y };
    if (flowPoints(ends, SAMPLES).some(inside)) return edge.id;
  }
  return undefined;
}

/**
 * What `node` would pass on to `consumer` when put into a flow of `item`: the same item if the node passes it
 * on, else the first thing it makes that the consumer takes; undefined when it doesn't take the item at all.
 */
export function insertedItem(node: NodeView, item: Id, consumer: NodeView): Id | undefined {
  const takes = (view: NodeView, candidate: Id) =>
    view.ports.some((port) => port.direction === "in" && (view.kind === "junction" || port.item.id === candidate));
  if (!takes(node, item)) return undefined;
  const makes =
    node.kind === "junction"
      ? [item]
      : node.ports.filter((port) => port.direction === "out").map((port) => port.item.id);
  return [item, ...makes].find((candidate) => makes.includes(candidate) && takes(consumer, candidate));
}

function portPoint(view: NodeView | undefined, handle: string): Point | undefined {
  const port = view?.ports.find((candidate) => candidate.handle === handle);
  return view && port && { x: view.position.x + port.x, y: view.position.y + port.y };
}

/**
 * The edits that put `node` into the flow `edgeId` (`edge`, whose consumer is `consumer`) at `position`, as one
 * batch; undefined when the node doesn't fit. The flow's belt carries on where the item stays the same.
 */
export function insertCommands(
  graph: string,
  edgeId: LocalId,
  edge: Edge,
  node: NodeView,
  consumer: NodeView,
  position: Point,
): CommandInput[] | undefined {
  const item = insertedItem(node, edge.item, consumer);
  if (item === undefined) return undefined;

  const { from, to, fromPort, toPort, logistics } = edge;
  const belt = logistics !== undefined && { logistics };
  return [
    { type: "disconnect", graph, ids: [edgeId] },
    {
      type: "connect",
      graph,
      edge: { from, to: node.id, ...(fromPort !== undefined && { fromPort }), item: edge.item, ...belt },
    },
    {
      type: "connect",
      graph,
      edge: { from: node.id, to, ...(toPort !== undefined && { toPort }), item, ...(item === edge.item && belt) },
    },
    { type: "moveNodes", graph, positions: { [node.id]: position } },
  ];
}
