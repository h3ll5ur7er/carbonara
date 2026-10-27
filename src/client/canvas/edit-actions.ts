// What the canvas offers the app's commands for editing the document on screen: the actions on its selection,
// arranging, and where a new node should go. Set by the document canvas on screen; empty without one.
import type { Node, Position } from "../../contracts/document";
import type { ArrangeDirection } from "../../contracts/layout";

export interface CanvasEditActions {
  /** Lays out the selection (two or more nodes) or else the whole graph. */
  arrange(direction: ArrangeDirection): void;
  /** Locks the selected nodes, or unlocks them when they all are locked already. */
  toggleLock(): void;
  /** Where a node added from outside the canvas (quick-add) goes: mid-view, clear of the others. */
  placeNew(node: Node): Position;
}

let actions: CanvasEditActions | undefined;

export function canvasEditActions(): CanvasEditActions | undefined {
  return actions;
}

export function setCanvasEditActions(next: CanvasEditActions | undefined): void {
  actions = next;
}
