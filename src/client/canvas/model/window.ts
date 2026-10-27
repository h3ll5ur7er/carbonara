// The window of a large graph the canvas hands to React Flow: the nodes in and around the view, and the ends
// of the flows that cross it. Hides how they're found (a grid of buckets over the graph) and when the window
// moves (only when the view leaves it), so panning a 50,000-node factory costs about what panning the part on
// screen costs (docs/Design.md, Performance).
import type { CanvasScene } from "./scene";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Graphs with more nodes than this are windowed; smaller ones are handed to React Flow whole. */
export const WINDOWED_ABOVE = 2_000;

/** Flow units per grid bucket: a few cards across. */
const CELL = 1_024;

export interface GraphWindow {
  /** The nodes in `box`, and both ends of every flow that crosses it. */
  nodesIn(box: Box): Set<string>;
}

interface Entry {
  box: Box;
  /** The node, or a flow's two ends. */
  ids: string[];
}

export function graphWindow(scene: CanvasScene): GraphWindow {
  const buckets = new Map<string, Entry[]>();
  const add = (entry: Entry) => {
    for (const key of cellsOf(entry.box)) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push(entry);
      else buckets.set(key, [entry]);
    }
  };
  const boxes = new Map<string, Box>();
  for (const node of scene.nodes) {
    const box = { ...node.position, width: node.width, height: node.height };
    boxes.set(node.id, box);
    add({ box, ids: [node.id] });
  }
  for (const edge of scene.edges) {
    const [from, to] = [boxes.get(edge.source), boxes.get(edge.target)];
    if (from && to) add({ box: union(from, to), ids: [edge.source, edge.target] });
  }
  return {
    nodesIn(box) {
      const found = new Set<string>();
      for (const key of cellsOf(box)) {
        for (const entry of buckets.get(key) ?? []) {
          if (overlaps(entry.box, box)) for (const id of entry.ids) found.add(id);
        }
      }
      return found;
    },
  };
}

/** The window to show around a view: half a view more on every side, so short pans stay inside it. */
export function windowAround(view: Box): Box {
  return { x: view.x - view.width / 2, y: view.y - view.height / 2, width: view.width * 2, height: view.height * 2 };
}

/** Whether a window still serves a view: it holds the view, and isn't many times larger (zoomed in since). */
export function serves(window: Box, view: Box): boolean {
  const holds =
    view.x >= window.x &&
    view.y >= window.y &&
    view.x + view.width <= window.x + window.width &&
    view.y + view.height <= window.y + window.height;
  return holds && window.width * window.height <= 16 * view.width * view.height;
}

function cellsOf(box: Box): string[] {
  const keys: string[] = [];
  const [left, right] = [Math.floor(box.x / CELL), Math.floor((box.x + box.width) / CELL)];
  const [top, bottom] = [Math.floor(box.y / CELL), Math.floor((box.y + box.height) / CELL)];
  for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) keys.push(`${x},${y}`);
  return keys;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
