// Hides where a dragged node settles: on a neighbour's edge or centre line, evenly spaced in its row or
// column, or else on the grid; and which guides and spacing marks explain the choice to the user.
// Everything is in flow units; the caller converts the pixel threshold with the zoom.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Axis = "x" | "y";

/** A line through aligned edges or centres: at `at` on the axis, spanning `from`–`to` across it. */
export interface Guide {
  axis: Axis;
  at: number;
  from: number;
  to: number;
}

/** An equal gap between two neighbours along the axis, drawn across at `at`. */
export interface Gap {
  axis: Axis;
  from: number;
  to: number;
  at: number;
}

export interface Snapped {
  x: number;
  y: number;
  guides: Guide[];
  gaps: Gap[];
}

export interface SnapOptions {
  grid: number;
  /** How far a node may jump to align, in flow units. */
  threshold: number;
}

/** Equal within float noise. */
const SAME = 0.5;

interface Span {
  start: number;
  size: number;
}

interface Candidate {
  delta: number;
  gaps: Gap[];
}

export function snapDrag(moving: Rect, others: Rect[], { grid, threshold }: SnapOptions): Snapped {
  const x = settle("x", moving, others, grid, threshold);
  const y = settle("y", moving, others, grid, threshold);
  const placed = { ...moving, x: moving.x + x.delta, y: moving.y + y.delta };
  return {
    x: placed.x,
    y: placed.y,
    guides: [...guides("x", placed, others), ...guides("y", placed, others)],
    gaps: [...x.gaps, ...y.gaps],
  };
}

function span(rect: Rect, axis: Axis): Span {
  return axis === "x" ? { start: rect.x, size: rect.width } : { start: rect.y, size: rect.height };
}

function cross(axis: Axis): Axis {
  return axis === "x" ? "y" : "x";
}

/** Left, centre and right (or top, middle and bottom). */
function lines({ start, size }: Span): number[] {
  return [start, start + size / 2, start + size];
}

function overlaps(a: Rect, b: Rect, axis: Axis): boolean {
  const first = span(a, axis);
  const second = span(b, axis);
  return first.start < second.start + second.size && second.start < first.start + first.size;
}

/** The smallest move along the axis that aligns or evenly spaces the node, or else the grid step. */
function settle(axis: Axis, moving: Rect, others: Rect[], grid: number, threshold: number): Candidate {
  const own = span(moving, axis);
  const candidates: Candidate[] = [];
  for (const other of others) {
    for (const mine of lines(own)) {
      for (const theirs of lines(span(other, axis))) candidates.push({ delta: theirs - mine, gaps: [] });
    }
  }
  candidates.push(...spacing(axis, moving, others));

  let best: Candidate | undefined;
  for (const candidate of candidates) {
    if (Math.abs(candidate.delta) > threshold) continue;
    if (!best || Math.abs(candidate.delta) < Math.abs(best.delta)) best = candidate;
  }
  return best ?? { delta: Math.round(own.start / grid) * grid - own.start, gaps: [] };
}

/**
 * Even spacing among the neighbours in the node's row (for x) or column (for y): centred between the nearest
 * neighbour on each side, or one more step of the gap between the two neighbours on one side.
 */
function spacing(axis: Axis, moving: Rect, others: Rect[]): Candidate[] {
  const across = cross(axis);
  const own = span(moving, axis);
  const inLine = others.filter((other) => overlaps(other, moving, across));
  const before = inLine
    .filter((other) => end(other, axis) <= own.start + own.size / 2)
    .sort((a, b) => end(b, axis) - end(a, axis));
  const after = inLine
    .filter((other) => span(other, axis).start >= own.start + own.size / 2)
    .sort((a, b) => span(a, axis).start - span(b, axis).start);
  const [near, far] = before;
  const [next, beyond] = after;
  const at = (a: Rect, b: Rect) => middleOfOverlap(a, b, across);
  const gap = (from: number, to: number, a: Rect, b: Rect): Gap => ({ axis, from, to, at: at(a, b) });
  const candidates: Candidate[] = [];

  if (near && next) {
    const start = (end(near, axis) + span(next, axis).start - own.size) / 2;
    candidates.push({
      delta: start - own.start,
      gaps: [gap(end(near, axis), start, near, moving), gap(start + own.size, span(next, axis).start, moving, next)],
    });
  }
  if (near && far) {
    const size = span(near, axis).start - end(far, axis);
    const start = end(near, axis) + size;
    if (size > 0) {
      candidates.push({
        delta: start - own.start,
        gaps: [gap(end(far, axis), span(near, axis).start, far, near), gap(end(near, axis), start, near, moving)],
      });
    }
  }
  if (next && beyond) {
    const size = span(beyond, axis).start - end(next, axis);
    const start = span(next, axis).start - size - own.size;
    if (size > 0) {
      candidates.push({
        delta: start - own.start,
        gaps: [
          gap(start + own.size, span(next, axis).start, moving, next),
          gap(end(next, axis), span(beyond, axis).start, next, beyond),
        ],
      });
    }
  }
  return candidates;
}

function end(rect: Rect, axis: Axis): number {
  const { start, size } = span(rect, axis);
  return start + size;
}

function middleOfOverlap(a: Rect, b: Rect, axis: Axis): number {
  const first = span(a, axis);
  const second = span(b, axis);
  const start = Math.max(first.start, second.start);
  const stop = Math.min(first.start + first.size, second.start + second.size);
  return (start + stop) / 2;
}

/** Every line of the placed node that lines up with a neighbour's, spanning all the rects on it. */
function guides(axis: Axis, placed: Rect, others: Rect[]): Guide[] {
  const across = cross(axis);
  const result: Guide[] = [];
  for (const mine of lines(span(placed, axis))) {
    const aligned = others.filter((other) => lines(span(other, axis)).some((theirs) => Math.abs(theirs - mine) < SAME));
    if (aligned.length === 0) continue;
    const spans = [placed, ...aligned].map((rect) => span(rect, across));
    result.push({
      axis,
      at: mine,
      from: Math.min(...spans.map((s) => s.start)),
      to: Math.max(...spans.map((s) => s.start + s.size)),
    });
  }
  return result;
}
