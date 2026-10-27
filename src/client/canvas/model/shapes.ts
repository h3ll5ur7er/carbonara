// Hides how the canvas tells the layout engine what it draws: each node's size and where its ports sit.
import type { LocalId } from "../../../contracts/document";
import type { NodeShape } from "../../../contracts/layout";
import type { NodeView } from "./scene";

/** The shapes of the nodes, as `editing.arrange` takes them. Junction ports carry any item. */
export function shapesOf(nodes: readonly NodeView[]): Record<LocalId, NodeShape> {
  return Object.fromEntries(
    nodes.map((view) => [
      view.id,
      {
        width: view.width,
        height: view.height,
        ports: view.ports.map((port) => ({
          side: port.direction,
          ...(view.kind !== "junction" && { item: port.item.id }),
          x: port.x,
          y: port.y,
        })),
      },
    ]),
  );
}
