// What the canvas offers the app's commands for editing the document on screen: the actions on its selection,
// arranging, undo, and where a new node should go. Set by the document canvas on screen; empty without one.
import type { Node, Position, TagColour } from "../../contracts/document";
import type { ArrangeDirection } from "../../contracts/layout";
import type { AlignMode, DistributeAxis } from "./model/align";
import type { NavigationActions } from "./use-navigation";

export interface CanvasEditActions extends NavigationActions {
  /** Lays out the selection (two or more nodes) or else the whole graph. */
  arrange(direction: ArrangeDirection): void;
  /** Deletes the selected nodes and flows; with `bridge`, reconnects the flows that ran through the nodes. */
  deleteSelection(bridge: boolean): void;
  /** Lines the selected nodes up on an edge or centre (model/align.ts). */
  align(mode: AlignMode): void;
  /** Spaces the selected nodes evenly. */
  distribute(axis: DistributeAxis): void;
  /** Levels the flows between the selected nodes. */
  straighten(): void;
  /** Adds a sticky note in the middle of the view, clear of the other nodes. */
  addNote(): void;
  /** Puts a frame around the selected nodes. */
  frameSelection(): void;
  /** Gives the selected nodes a colour tag, or removes it (null). */
  tag(tag: TagColour | null): void;
  /** Locks the selected nodes, or unlocks them when they all are locked already. */
  toggleLock(): void;
  /** Shows rates in a rate unit (`per_minute`), a belt (`belt:<id>`), or `belts`: the pack's fastest belt. */
  showRatesIn(choice: string): void;
  /** Switches machine counts between "4 × 100% + 1 × 37.5%" and "5 × 87.5%". */
  toggleMachineGroups(): void;
  /** Downloads a picture of the whole graph. */
  exportImage(format: "png" | "svg"): void;
  undo(): void;
  redo(): void;
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
