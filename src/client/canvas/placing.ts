// A node on its way onto the canvas from outside it, such as a recipe dragged out of the recipe browser. The canvas
// on screen draws it as a ghost following the pointer (the ghost renderer's pointer mode) and adds it where the drag
// is let go or the next click lands; Escape cancels. Whoever starts it hears where it went.
import { create } from "zustand";
import type { LocalId, Node } from "../../contracts/document";
import type { PortRef } from "./edit-actions";

export interface Placing {
  node: Node;
  /** What it is, on the ghost's frame and in the history: "Iron Plate". */
  label: string;
  /** A port on the canvas to connect it to once placed (a suggestion's). */
  connectTo?: PortRef | undefined;
  /** The node was added, under this id. */
  onPlaced?: ((id: LocalId) => void) | undefined;
}

export const usePlacing = create<{ placing: Placing | null }>(() => ({ placing: null }));

export function startPlacing(placing: Placing): void {
  usePlacing.setState({ placing });
}

export function stopPlacing(): void {
  usePlacing.setState({ placing: null });
}

/**
 * Whether a pointer event happened over the canvas. A drag from outside that is let go there is placed by the canvas
 * itself, where its ghost is drawn (ghost/use-ghost-layer.tsx); one let go anywhere else is for its source to cancel.
 */
export function overCanvas(event: { clientX: number; clientY: number }): boolean {
  return document.elementFromPoint(event.clientX, event.clientY)?.closest(".react-flow__pane") != null;
}
