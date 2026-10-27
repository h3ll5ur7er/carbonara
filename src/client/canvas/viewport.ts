// What the canvas offers to the rest of the app about its view: where the user is looking (quick-add places
// new nodes there) and the zoom actions the app's commands run. Set by the canvas on screen; empty without one.
import type { Point, Viewport } from "./adapter";

export interface CanvasActions {
  /** Shows the whole graph, clear of the side panels. */
  zoomToFit(): void;
  /** Shows the selected nodes, or the whole graph when nothing is selected. */
  zoomToSelection(): void;
  /** Selects these nodes (and these flows), and nothing else. */
  select(nodeIds: string[], edgeIds?: string[]): void;
  /** Selects these nodes and brings them into view (find's jump). */
  focus(nodeIds: string[]): void;
  /** Moves the view there, animated (bookmarks, back and forward); resolves once it's there. */
  goTo(viewport: Viewport): Promise<void>;
  /** Dives into a node: zooms in until it fills the view, animated; resolves with the view it arrives at. */
  zoomInto(nodeId: string): Promise<Viewport>;
  /** A picture of the whole graph as a data URL. */
  image(format: "png" | "svg"): Promise<string>;
  /** The flow position under a point on screen (client pixels). */
  toFlow(screen: Point): Point;
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
