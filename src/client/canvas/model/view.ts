// Hides how screen geometry maps to flow positions for things outside the canvas, such as where the user
// is looking (quick-add places new nodes there).
import type { Insets, Point, Viewport } from "../adapter";

/** The flow position at the middle of the part of the canvas that the side panels leave visible. */
export function visibleCentre(viewport: Viewport, size: { width: number; height: number }, insets: Insets): Point {
  const screenX = insets.left + (size.width - insets.left - insets.right) / 2;
  const screenY = size.height / 2;
  return { x: (screenX - viewport.x) / viewport.zoom, y: (screenY - viewport.y) / viewport.zoom };
}
