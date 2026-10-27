// Hides how the canvas remembers where you've been: back and forward through the places you looked at, like a
// browser, and nine viewport bookmarks. A settled view counts as a new place when it moved by a third of the
// screen or zoomed by a fifth; smaller moves just update where you are. Pure; the canvas keeps one per document.
import type { Viewport } from "../adapter";

export interface Navigation {
  back: Viewport[];
  forward: Viewport[];
  current: Viewport | undefined;
  /** Slots 1–9. */
  bookmarks: Record<number, Viewport>;
}

/** How far a view must move, as a share of the screen, or zoom, as a ratio, to be a new place. */
const MOVE = 1 / 3;
const ZOOM = 1.2;
/** History this long is plenty; older places drop off. */
const LIMIT = 50;

export function startNavigation(): Navigation {
  return { back: [], forward: [], current: undefined, bookmarks: {} };
}

export function visit(state: Navigation, viewport: Viewport, size: { width: number; height: number }): Navigation {
  const { current } = state;
  if (!current) return { ...state, current: viewport };
  const moved =
    Math.abs(viewport.x - current.x) > size.width * MOVE || Math.abs(viewport.y - current.y) > size.height * MOVE;
  const zoomed = Math.max(viewport.zoom / current.zoom, current.zoom / viewport.zoom) > ZOOM;
  if (!moved && !zoomed) return { ...state, current: viewport };
  return { ...state, back: [...state.back, current].slice(-LIMIT), forward: [], current: viewport };
}

/** Where back goes, and the state once there; no target at the start. */
export function back(state: Navigation): { state: Navigation; target: Viewport | undefined } {
  const target = state.back.at(-1);
  if (!target || !state.current) return { state, target: undefined };
  return {
    state: { ...state, back: state.back.slice(0, -1), forward: [state.current, ...state.forward], current: target },
    target,
  };
}

export function forward(state: Navigation): { state: Navigation; target: Viewport | undefined } {
  const [target, ...rest] = state.forward;
  if (!target || !state.current) return { state, target: undefined };
  return { state: { ...state, back: [...state.back, state.current], forward: rest, current: target }, target };
}

export function bookmark(state: Navigation, slot: number, viewport: Viewport): Navigation {
  return { ...state, bookmarks: { ...state.bookmarks, [slot]: viewport } };
}

/** The first empty slot; slot 1 again once all are taken. */
export function freeSlot(state: Navigation): number {
  for (let slot = 1; slot <= 9; slot++) if (!state.bookmarks[slot]) return slot;
  return 1;
}
