// What the canvas offers to the rest of the app about its view: where the user is looking (quick-add places
// new nodes there) and the zoom actions the app's commands run. Set by the canvas on screen; empty without one.
import type { Point } from "./adapter";

export interface CanvasActions {
  /** Shows the whole graph, clear of the side panels. */
  zoomToFit(): void;
  /** Shows the selected nodes, or the whole graph when nothing is selected. */
  zoomToSelection(): void;
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
