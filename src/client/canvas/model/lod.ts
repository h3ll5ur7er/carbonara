// Hides how much of a node the canvas draws at a zoom level: the full card while its text is readable,
// a compact card (building, title, machine count in large type) in between, a coloured chip at overview.
// Fewer, larger elements when zoomed out keep large graphs smooth.

export type LodTier = "full" | "compact" | "chip";

/** At this zoom the full card's 11–13 px text drops below about 7 px on screen. */
const FULL_FROM = 0.6;
/**
 * The least a factory is zoomed to when it opens: full cards, centred on it, even if not all of it fits beside the
 * side panels. Zoom to fit (F) still shows all of it.
 */
export const READABLE_ZOOM = FULL_FROM;
/** Below this zoom even the compact card's large type is unreadable; only colour and shape remain. */
const COMPACT_FROM = 0.25;

export function lodTier(zoom: number): LodTier {
  if (zoom >= FULL_FROM) return "full";
  if (zoom >= COMPACT_FROM) return "compact";
  return "chip";
}
