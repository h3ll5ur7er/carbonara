// The ghost: a translucent preview of nodes and flows that aren't in the document yet (a planner proposal, a
// paste, a blueprint being dragged). Hides how such a preview joins the canvas: its views get ids of their
// own, its numbers sit next to the document's results, and it is placed by an offset, fixed or following
// the pointer. The renderer draws it with the document's node and edge components (see use-ghost-layer.tsx).
import type { Graph, LocalId, Position } from "../../../contracts/document";
import type { AnalysisResults, EdgeResult, NodeItems, NodeResult } from "../../../contracts/results";
import type { Point } from "../adapter";
import type { CanvasScene } from "../model/scene";
import { snapDrag, type Gap, type Guide, type SnapOptions } from "../model/snap";

/** What to preview, and where. */
export interface Ghost {
  graph: Graph;
  /** Where its nodes would go, in flow units, before the placement moves them. */
  positions: Record<LocalId, Position>;
  /**
   * Numbers to show on it (machine counts, rates, flows), by its own node and edge ids, and the items its recipe
   * nodes' effective recipes use where they differ from the pack's (`AnalysisResults.effectiveItems`).
   */
  results?:
    | {
        nodes: Record<LocalId, NodeResult>;
        edges: Record<LocalId, EdgeResult>;
        effectiveItems?: Record<LocalId, NodeItems> | undefined;
      }
    | undefined;
  placement: GhostPlacement;
  /** What it is, on its frame: "Proposal", "Paste". */
  label: string;
}

/**
 * `fixed`: drawn `offset` away from its positions; dragging it moves it as one and reports the new offset.
 * `pointer`: its centre follows the pointer, snapping like a dragged node, until a click (or Enter) places it;
 * Escape cancels and the arrow keys move it. It starts centred on `at` (flow units) when given, else under the
 * pointer when that was last on the canvas, else mid-view.
 */
export type GhostPlacement = { mode: "fixed"; offset: Point } | { mode: "pointer"; at?: Point };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The ghost's views under ghost ids and the area they cover; they change only when its content does. */
export interface GhostContent {
  scene: CanvasScene;
  bounds: Rect;
  label: string;
}

/** What a renderer gets: the ghost's content and where it is. */
export interface GhostView extends GhostContent {
  placement: GhostPlacement;
}

const PREFIX = "ghost:";

export const ghostId = (id: LocalId): string => `${PREFIX}${id}`;
export const isGhost = (id: string): boolean => id.startsWith(PREFIX);

/** The ghost's scene (built like the document's) under ghost ids. */
export function ghostContent(scene: CanvasScene, label: string): GhostContent {
  return {
    scene: {
      nodes: scene.nodes.map((node) => ({ ...node, id: ghostId(node.id) })),
      edges: scene.edges.map((edge) => ({
        ...edge,
        id: ghostId(edge.id),
        source: ghostId(edge.source),
        target: ghostId(edge.target),
      })),
    },
    bounds: boundsOf(scene),
    label,
  };
}

/** The smallest rectangle around the scene's nodes. */
export function boundsOf(scene: CanvasScene): Rect {
  if (scene.nodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const left = Math.min(...scene.nodes.map((node) => node.position.x));
  const top = Math.min(...scene.nodes.map((node) => node.position.y));
  const right = Math.max(...scene.nodes.map((node) => node.position.x + node.width));
  const bottom = Math.max(...scene.nodes.map((node) => node.position.y + node.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The document's results with the ghost's numbers added under ghost ids, for the canvas's result slots. */
export function withGhostResults(
  results: AnalysisResults | null,
  ghost: Ghost["results"] | undefined,
): AnalysisResults | null {
  if (!ghost) return results;
  const prefixed = <T>(entries: Record<LocalId, T>) =>
    Object.fromEntries(Object.entries(entries).map(([id, value]) => [ghostId(id), value]));
  const base = results ?? {
    documentId: "",
    version: 0,
    graph: "root",
    nodes: {},
    edges: {},
    diagnostics: [],
    totals: { raw: {}, buildings: {} },
  };
  return {
    ...base,
    nodes: { ...base.nodes, ...prefixed(ghost.nodes) },
    edges: { ...base.edges, ...prefixed(ghost.edges) },
  };
}

/**
 * The nodes to show along with a new ghost: those of the graph near it (within about two cards' width), so
 * it's seen in context without zooming out on the whole of a large factory.
 */
export function neighbours(bounds: Rect, nodes: (Rect & { id: string })[]): string[] {
  const near = {
    x: bounds.x - NEAR,
    y: bounds.y - NEAR,
    width: bounds.width + 2 * NEAR,
    height: bounds.height + 2 * NEAR,
  };
  return nodes.filter((node) => !isGhost(node.id) && overlaps(node, near)).map((node) => node.id);
}

/** How far around a ghost its neighbours are, in flow units. */
const NEAR = 480;

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Where a ghost following the pointer goes, and the guides that explain a snap to its neighbours. */
export interface Followed {
  offset: Point;
  guides: Guide[];
  gaps: Gap[];
}

/**
 * The offset that centres the ghost on `pointer`, snapped as a dragged node snaps (model/snap.ts): its edges or
 * centre onto a nearby node's, even spacing, or else its top-left corner onto the grid.
 */
export function followPointer(bounds: Rect, pointer: Point, others: Rect[], options: SnapOptions): Followed {
  const moving = { ...bounds, x: pointer.x - bounds.width / 2, y: pointer.y - bounds.height / 2 };
  const snapped = snapDrag(moving, others, options);
  return { offset: { x: snapped.x - bounds.x, y: snapped.y - bounds.y }, guides: snapped.guides, gaps: snapped.gaps };
}

/** Where the ghost's nodes land when it's placed at `offset`. */
export function placedPositions(positions: Record<LocalId, Position>, offset: Point): Record<LocalId, Position> {
  return Object.fromEntries(
    Object.entries(positions).map(([id, position]) => [
      id,
      { ...position, x: position.x + offset.x, y: position.y + offset.y },
    ]),
  );
}
