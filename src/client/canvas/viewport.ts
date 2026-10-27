// Where the user is looking on the canvas, for features outside it: quick-add places new nodes there.
// Updated by the canvas whenever the view settles; undefined until a canvas has been shown.
import type { Point } from "./adapter";

let centre: Point | undefined;

/** The flow position in the middle of the visible canvas, or undefined when no canvas is shown. */
export function viewportCentre(): Point | undefined {
  return centre;
}

export function setViewportCentre(point: Point | undefined): void {
  centre = point;
}
