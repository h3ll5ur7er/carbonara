// The seam between the canvas host and whatever draws the canvas (React Flow today, perhaps WebGL later).
// A renderer gets a renderer-neutral scene and the result slots, and reports the user's intents back;
// it never talks to managers or knows about commands. See docs/Architecture.md, "How the canvas is drawn".
import type { ComponentType, ReactNode } from "react";
import type { LocalId } from "../../contracts/document";
import type { Id } from "../../contracts/pack";
import type { GhostView } from "./ghost/ghost";
import type { MachineGroups, RateDisplay } from "./model/format";
import type { ResultSlots } from "./model/result-slots";
import type { CanvasScene } from "./model/scene";

export interface Point {
  x: number;
  y: number;
}

export interface PortDrop {
  node: LocalId;
  item: Id;
  /** The blueprint port, when the drag started from a subgraph instance's port. */
  port?: LocalId;
  /** The side of the port the drag started from. */
  side: "in" | "out";
  /** Where it was dropped: in flow units, and in pixels from the canvas's top-left corner. */
  flow: Point;
  screen: Point;
}

/** Two ports the user joined, as the flow between them. */
export interface Connected {
  from: LocalId;
  to: LocalId;
  item: Id;
  fromPort?: LocalId;
  toPort?: LocalId;
}

export interface Insets {
  left: number;
  right: number;
}

/** Pan (screen pixels) and zoom. */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasViewProps {
  scene: CanvasScene;
  /** Where to look first; the whole scene when left out. */
  initialViewport?: Viewport;
  /** Screen pixels at the left and right edges that floating panels cover; fitting keeps the graph clear of them. */
  insets: Insets;
  results: ResultSlots;
  /** How rates are shown: the document's unit, and its belt for the items that belt carries. */
  rateUnit: RateDisplay;
  /** How machine counts read: "fill" (4 × 100% + 1 × 37.5%) or "even" (5 × 87.5%). */
  machineGroups: MachineGroups;
  /** Nodes were dropped at new positions (top-left corners, flow units). */
  onMoveNodes(positions: Record<LocalId, Point>): void;
  /** The user connected two ports (an instance's through one of its blueprint's ports). */
  onConnect(edge: Connected): void;
  /** A connection from a port was dropped in empty space: time to offer what could go there. */
  onPortDropped(drop: PortDrop): void;
  /** The view settled; `centre` is the flow position in the middle of the visible canvas. */
  onViewCentre(centre: Point): void;
  /** The selected nodes or flows changed. */
  onSelectionChange(nodeIds: LocalId[], edgeIds: LocalId[]): void;
  /** A node without flows was dropped onto a flow, at `position` (top-left, flow units). */
  onInsert(node: LocalId, edge: LocalId, position: Point): void;
  /** One end of a flow was dragged (with Alt) to another port. */
  onRewire(edge: LocalId, to: Connected): void;
  /** The view came to rest (after a pan, a zoom, a jump), on a canvas of this size in screen pixels. */
  onViewSettled(viewport: Viewport, size: { width: number; height: number }): void;
  /** A note's text or a frame's label was edited in place. */
  onEditText(node: LocalId, text: string): void;
  /** A note or frame was resized (top-left corner and size, flow units). */
  onResize(node: LocalId, rect: { x: number; y: number; width: number; height: number }): void;
  /** A subgraph instance was double-clicked, or its open button pressed. */
  onOpenSubgraph?(node: LocalId): void;
  /** Backspace on the canvas: delete the selection (and bridge, with Mod+Shift), as the Delete key's command does. */
  onDelete(bridge: boolean): void;
  /** A preview to draw over the scene (ghost/ghost.ts); its numbers are in `results` under ghost ids. */
  ghost?: GhostView | undefined;
  /** The ghost was dragged to, or clicked down at, this offset from its positions. */
  onGhostPlace?(offset: Point): void;
  /** Escape while the ghost follows the pointer. */
  onGhostCancel?(): void;
  /** Drawn over the graph in flow coordinates (the bottleneck heatmap); it never takes the pointer. */
  overlay?: ReactNode;
}

/** A renderer of the factory canvas. */
export type CanvasAdapter = ComponentType<CanvasViewProps>;
