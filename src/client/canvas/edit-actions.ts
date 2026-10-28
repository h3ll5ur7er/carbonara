// What the canvas offers the app's commands for editing the document on screen: the actions on its selection,
// arranging, undo, and where a new node should go. Set by the document canvas on screen; empty without one.
import type { LocalId, Node, Position, TagColour } from "../../contracts/document";
import type { ArrangeDirection } from "../../contracts/layout";
import type { Id } from "../../contracts/pack";
import type { ClipboardActions } from "./clipboard-actions";
import type { AlignMode, DistributeAxis } from "./model/align";
import type { NavigationActions } from "./use-navigation";

export interface CanvasEditActions extends NavigationActions, ClipboardActions {
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
  /** Collapses the selected frames to their label bar, or expands them when they all are collapsed already. */
  toggleCollapse(): void;
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
  /**
   * Adds a node from outside the canvas (the recipe browser, quick-add) to the graph on screen, as one undo step
   * labelled `label`, and selects it once it's drawn. It goes to `position`, else beside the port it connects to,
   * else where `placeNew` says. Answers its id.
   */
  addNode(node: Node, options: AddNodeOptions): LocalId;
  /** The recipes the selected nodes run, each once, and the pack they're of. */
  selectedRecipes(): { packId: string; recipes: Id[] };
  /** Collapses the selected nodes into a new subgraph, and selects its instance. */
  collapseSelection(): void;
  /** Expands the selected subgraph instances back into the graph. */
  expandSelection(): void;
  /** Opens the selected subgraph instance. */
  openSubgraph(): void;
}

export interface AddNodeOptions {
  label: string;
  position?: Position | undefined;
  /** A port of a node on screen to connect the new node to: an input takes from it, an output feeds it. */
  connectTo?: PortRef | undefined;
}

/** A node's port by its item and side, as diagnostics and suggestions name it. */
export interface PortRef {
  node: LocalId;
  item: Id;
  side: "in" | "out";
}

let actions: CanvasEditActions | undefined;

export function canvasEditActions(): CanvasEditActions | undefined {
  return actions;
}

export function setCanvasEditActions(next: CanvasEditActions | undefined): void {
  actions = next;
}
