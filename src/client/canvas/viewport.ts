// What the canvas offers to the rest of the app about its view: where the user is looking (quick-add places
// new nodes there) and the zoom actions the app's commands run. Set by the canvas on screen; empty without one.
import type { Point, Viewport } from "./adapter";

export interface CanvasActions {
  /** Shows the whole graph, clear of the side panels. */
  zoomToFit(): void;
  /** Shows the selected nodes, or the whole graph when nothing is selected. */
  zoomToSelection(): void;
  /** Selects these nodes and brings them into view (find's jump). */
  focus(nodeIds: string[]): void;
  /** Moves the view there, animated (bookmarks, back and forward). */
  goTo(viewport: Viewport): void;
  /** Where the view is now, and the canvas's size in screen pixels. */
  view(): { viewport: Viewport; size: { width: number; height: number } };
}

let centre: Point | undefined;
let actions: CanvasActions | undefined;

/** The flow position in the middle of the visible canvas, or undefined when no canvas is shown. */
export function viewportCentre(): Point | undefined {
  return centre;
}

export function setViewportCentre(point: Point | undefined): void {
  centre = point;
}

export function canvasActions(): CanvasActions | undefined {
  return actions;
}

export function setCanvasActions(next: CanvasActions | undefined): void {
  actions = next;
}
