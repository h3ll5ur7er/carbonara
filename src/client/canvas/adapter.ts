// The seam between the canvas host and whatever draws the canvas (React Flow today, perhaps WebGL later).
// A renderer gets a renderer-neutral scene and the result slots, and reports the user's intents back;
// it never talks to managers or knows about commands. See docs/Architecture.md, "How the canvas is drawn".
import type { ComponentType } from "react";
import type { LocalId } from "../../contracts/document";
import type { Id, RateUnit } from "../../contracts/pack";
import type { ResultSlots } from "./model/result-slots";
import type { CanvasScene } from "./model/scene";

export interface Point {
  x: number;
  y: number;
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
  /** The unit rates are shown in. */
  rateUnit: RateUnit;
  /** Nodes were dropped at new positions (top-left corners, flow units). */
  onMoveNodes(positions: Record<LocalId, Point>): void;
  /** The user connected two ports. */
  onConnect(edge: { from: LocalId; to: LocalId; item: Id }): void;
  /** The view settled; `centre` is the flow position in the middle of the visible canvas. */
  onViewCentre(centre: Point): void;
}

/** A renderer of the factory canvas. */
export type CanvasAdapter = ComponentType<CanvasViewProps>;
