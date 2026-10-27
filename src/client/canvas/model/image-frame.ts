// Hides how an exported picture of the canvas is framed: the whole graph with a margin, at real size unless that
// would make the picture's longest side larger than allowed (then scaled down to fit).
import type { Viewport } from "../adapter";
import type { Rect } from "./snap";

export interface ImageFrame {
  /** The picture's size in pixels. */
  width: number;
  height: number;
  /** The pan and zoom that put the graph in it. */
  viewport: Viewport;
}

export function imageFrame(bounds: Rect, margin: number, maxSide: number): ImageFrame {
  const zoom = Math.min(1, maxSide / Math.max(bounds.width + margin * 2, bounds.height + margin * 2));
  const width = Math.round((bounds.width + margin * 2) * zoom);
  const height = Math.round((bounds.height + margin * 2) * zoom);
  return { width, height, viewport: { x: (margin - bounds.x) * zoom, y: (margin - bounds.y) * zoom, zoom } };
}
