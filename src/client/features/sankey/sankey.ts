// The Sankey overview's layout: the whole factory as columns of nodes, left to right in the direction of flow,
// joined by bands as wide as their rates. It hides how the factory becomes a chart that reads at a glance:
// - junctions pass their flows straight through instead of standing as columns of their own;
// - a band that skips columns takes a slot in each column it passes, so it never runs through a node;
// - nodes within a column are ordered so bands cross as little as they can (barycentre sweeps from the canvas's
//   own order), then nudged level with what they connect to;
// - labels sit beside their node where the bands leave room: above a node's bar, right of an output's;
// - recycling loops (flows that run right to left on the canvas) loop back below the chart.
import type { LocalId } from "../../../contracts/document";
import type { Id } from "../../../contracts/pack";
import type { AnalysisResults } from "../../../contracts/results";
import { flowSaturation, type FlowSaturation } from "../../canvas/model/flow-style";
import type { CanvasScene, NodeView } from "../../canvas/model/scene";

export interface SankeyNode {
  id: LocalId;
  kind: "recipe" | "source" | "sink" | "junction";
  label: string;
  /** The item a source, sink or junction carries; recipes are tinted by their building's accent. */
  item?: Id;
  column: number;
  x: number;
  y: number;
  height: number;
  /** Items per second through the node: the larger of what comes in and what goes out. */
  throughput: number;
  /** Where the label starts (`start`) or ends (`end`), at its text's middle: in room the bands leave free. */
  labelAt: { x: number; y: number; anchor: "start" | "end" };
}

export interface Point {
  x: number;
  y: number;
}

export interface SankeyLink {
  /** The edge's id; a band through junctions joins the ids of the edges it follows with `+`. */
  id: LocalId;
  source: LocalId;
  target: LocalId;
  item: Id;
  perSecond: number;
  width: number;
  /** A forward band's outline, to fill; a loop's centre line, to stroke `width` wide. */
  path: string;
  /** A forward band's centre where it leaves its source, at the middle of each column it passes, and at its target. */
  points: Point[];
  backward: boolean;
  saturation: FlowSaturation;
}

export interface SankeyLayout {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export const NODE_WIDTH = 14;
/** Room above a node for its label, and between bands passing a column. */
export const LABEL_ROOM = 34;
const PASSING_GAP = 10;
/** Room around the chart: above for the first labels, right for the outputs' labels. */
const MARGIN = { top: LABEL_ROOM + 2, right: 160, bottom: 24, left: 24 };
/** How far an output's label sits right of its bar. */
const LABEL_INSET = 8;
/** The fullest column fills this share of the height; the rest is air, so the bands read as shapes. */
const FILL = 0.75;
/** How far recycling loops run below the chart, and apart from each other. */
const LOOP_DROP = 18;
const MIN_HEIGHT = 2;
/** Barycentre sweeps (alternately down and up the columns), and passes levelling slots with their neighbours. */
const SWEEPS = 8;
const RELAXATIONS = 8;

type Kind = SankeyNode["kind"];
const KINDS = new Set<string>(["recipe", "source", "sink", "junction"]);

interface Flow {
  id: LocalId;
  source: LocalId;
  target: LocalId;
  item: Id;
  perSecond: number;
  saturation: FlowSaturation;
  backward: boolean;
}

/** What a column stacks: a node, or a band passing through. */
interface Slot {
  id: string;
  column: number;
  node?: NodeView;
  /** Items per second it stands for: its height on the chart's scale. */
  amount: number;
  /** Where it starts out, top to bottom: the canvas's order. */
  canvasY: number;
  y: number;
  height: number;
}

/** A forward band between two slots of neighbouring columns. */
interface Segment {
  from: Slot;
  to: Slot;
  perSecond: number;
}

export function sankeyLayout(
  scene: CanvasScene,
  results: AnalysisResults | null,
  size: { width: number; height: number },
  /** How wide a node's label is drawn, to find it room; estimated from its name when left out. */
  labelWidth: (node: SankeyNode) => number = (node) => estimateLabelWidth(node),
): SankeyLayout {
  if (!results) return { nodes: [], links: [] };
  const views = new Map(scene.nodes.filter((view) => KINDS.has(view.kind)).map((view) => [view.id, view]));
  const flows = throughJunctions(edgeFlows(scene, results, views), views);
  const used = [...views.values()].filter((view) =>
    flows.some((flow) => flow.source === view.id || flow.target === view.id),
  );
  if (used.length === 0) return { nodes: [], links: [] };

  // Columns: the longest path along forward flows; sources first, sinks last.
  const forward = flows.filter((flow) => !flow.backward);
  const column = ranks(
    used.map((view) => view.id),
    forward,
  );
  const last = Math.max(...column.values());
  for (const view of used) {
    if (view.kind === "source") column.set(view.id, 0);
    if (view.kind === "sink") column.set(view.id, Math.max(last, 1));
  }
  const columns = Math.max(...column.values()) + 1;
  const through = (id: LocalId, end: "source" | "target") =>
    flows.filter((flow) => flow[end] === id).reduce((total, flow) => total + flow.perSecond, 0);

  // Each column's slots: its nodes, and every band that passes it on the way to a later column.
  const stacks: Slot[][] = Array.from({ length: columns }, () => []);
  const slotOf = new Map<LocalId, Slot>();
  for (const view of used) {
    const at = column.get(view.id) ?? 0;
    const amount = Math.max(through(view.id, "source"), through(view.id, "target"));
    const slot: Slot = { id: view.id, column: at, node: view, amount, canvasY: view.position.y, y: 0, height: 0 };
    stacks[at]?.push(slot);
    slotOf.set(view.id, slot);
  }
  const routes = new Map<LocalId, Slot[]>();
  for (const flow of forward) {
    const [start, end] = [slotOf.get(flow.source), slotOf.get(flow.target)];
    if (!start || !end) continue;
    const route = [start];
    for (let at = start.column + 1; at < end.column; at++) {
      const share = (at - start.column) / (end.column - start.column);
      const canvasY = start.canvasY + (end.canvasY - start.canvasY) * share;
      const passing: Slot = { id: `${flow.id}@${at}`, column: at, amount: flow.perSecond, canvasY, y: 0, height: 0 };
      stacks[at]?.push(passing);
      route.push(passing);
    }
    route.push(end);
    routes.set(flow.id, route);
  }
  const segments = forward.flatMap((flow) => {
    const route = routes.get(flow.id) ?? [];
    return route.slice(1).map((to, index): Segment => ({ from: route[index] as Slot, to, perSecond: flow.perSecond }));
  });
  const roomAbove = (slot: Slot) => (slot.node ? LABEL_ROOM : PASSING_GAP);

  for (const stack of stacks) stack.sort((a, b) => a.canvasY - b.canvasY);
  orderColumns(stacks, segments);

  // One scale for every band: the fullest column fills the height left after the gaps (and room for loops).
  const loops = flows.length - forward.length;
  const height = size.height - MARGIN.top - MARGIN.bottom - (loops > 0 ? LOOP_DROP * (loops + 1) : 0);
  const gapsOf = (stack: Slot[]) => stack.slice(1).reduce((sum, slot) => sum + roomAbove(slot), 0);
  const scale = Math.min(
    ...stacks
      .filter((stack) => stack.length > 0)
      .map((stack) => {
        const total = stack.reduce((sum, slot) => sum + slot.amount, 0);
        return total > 0 ? (FILL * height - gapsOf(stack)) / total : Infinity;
      }),
  );
  const bounds = { top: MARGIN.top, bottom: MARGIN.top + height };
  for (const stack of stacks) {
    for (const slot of stack) slot.height = Math.max(MIN_HEIGHT, slot.amount * scale);
    const total = stack.reduce((sum, slot) => sum + slot.height, 0) + gapsOf(stack);
    let y = bounds.top + (height - total) / 2;
    for (const [index, slot] of stack.entries()) {
      if (index > 0) y += roomAbove(slot);
      slot.y = y;
      y += slot.height;
    }
  }
  relax(stacks, segments, roomAbove, bounds);
  centre(stacks.flat(), bounds);

  const span = size.width - MARGIN.left - MARGIN.right - NODE_WIDTH;
  const columnX = (at: number) => MARGIN.left + (columns > 1 ? (span * at) / (columns - 1) : span / 2);
  const nodes = new Map<LocalId, SankeyNode>();
  for (const slot of stacks.flat()) {
    const view = slot.node;
    if (!view) continue;
    const x = columnX(slot.column);
    const item = itemOf(view);
    nodes.set(view.id, {
      id: view.id,
      kind: view.kind as Kind,
      label: labelOf(view),
      ...(item !== undefined && { item }),
      column: slot.column,
      x,
      y: slot.y,
      height: slot.height,
      throughput: slot.amount,
      // Placed once the bands are drawn (`placeLabels`).
      labelAt: { x, y: slot.y, anchor: "start" },
    });
  }

  // Bands leave a node in the order their next slots sit, and arrive likewise, so they don't cross at the node.
  const neighbourY = (flow: Flow, end: "source" | "target"): number => {
    const route = routes.get(flow.id);
    const neighbour = route
      ? route[end === "source" ? 1 : route.length - 2]
      : slotOf.get(end === "source" ? flow.target : flow.source);
    return neighbour ? neighbour.y + neighbour.height / 2 : 0;
  };
  const offsets = new Map<string, number>();
  for (const node of nodes.values()) {
    for (const end of ["source", "target"] as const) {
      let offset = 0;
      const attached = flows
        .filter((flow) => flow[end] === node.id)
        .sort((a, b) => Number(a.backward) - Number(b.backward) || neighbourY(a, end) - neighbourY(b, end));
      for (const flow of attached) {
        const width = flow.perSecond * scale;
        offsets.set(`${end}:${flow.id}`, node.y + offset + width / 2);
        offset += width;
      }
    }
  }

  let loop = 0;
  const traces: Trace[] = [];
  const links = flows.map((flow): SankeyLink => {
    const from = nodes.get(flow.source) as SankeyNode;
    const to = nodes.get(flow.target) as SankeyNode;
    const width = flow.perSecond * scale;
    const start = { x: from.x + NODE_WIDTH, y: offsets.get(`source:${flow.id}`) ?? 0 };
    const end = { x: to.x, y: offsets.get(`target:${flow.id}`) ?? 0 };
    if (flow.backward) {
      loop += 1;
      const below = bounds.bottom + LOOP_DROP * loop;
      const bend = Math.max(24, width);
      const path =
        `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${start.x + bend} ${below}, ${start.x} ${below} ` +
        `L ${end.x} ${below} C ${end.x - bend} ${below}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`;
      return { ...flow, width, path, points: [start, end] };
    }
    const passing = (routes.get(flow.id) ?? []).slice(1, -1).map((slot) => columnX(slot.column));
    const stops: Point[] = [
      start,
      ...passing.flatMap((left, index) => {
        const slot = routes.get(flow.id)?.[index + 1] as Slot;
        const y = slot.y + slot.height / 2;
        return [
          { x: left, y },
          { x: left + NODE_WIDTH, y },
        ];
      }),
      end,
    ];
    traces.push({ points: trace(stops), half: width / 2 });
    return {
      ...flow,
      width,
      path: bandPath(stops, width),
      points: [
        start,
        ...passing.map((left, index) => ({ x: left + NODE_WIDTH / 2, y: stops[1 + 2 * index]?.y ?? 0 })),
        end,
      ],
    };
  });

  const outputs = new Set([...nodes.keys()].filter((id) => through(id, "source") === 0));
  placeLabels([...nodes.values()], outputs, traces, size, labelWidth);
  return { nodes: [...nodes.values()], links };
}

/** About how wide a label is drawn: its name and its rate, in the overview's small type. */
export function estimateLabelWidth(node: Pick<SankeyNode, "label">, rate = "00.0/min"): number {
  return (node.label.length + rate.length + 1) * 6.2;
}

/** A band's centre line, sampled, and half its width: what a label must keep clear of. */
interface Trace {
  points: Point[];
  half: number;
}

const LABEL_HEIGHT = 14;
const SAMPLES = 16;
/** Beyond this many nodes labels take their first place unchecked: the checks grow with nodes times bands. */
const CHECKED_LABELS = 400;

/**
 * Puts each node's label where it overlaps the least of the bands, the bars and the labels placed before it:
 * an output's right of its bar (nothing leaves it); any other node's above its bar, running right or left, else
 * below it. Next to a column the bands run level, so the gaps between a column's slots are usually free.
 */
function placeLabels(
  nodes: SankeyNode[],
  outputs: ReadonlySet<LocalId>,
  traces: Trace[],
  size: { width: number; height: number },
  labelWidth: (node: SankeyNode) => number,
): void {
  const placed: Rect[] = [];
  const bars: Rect[] = nodes.map((node) => ({
    left: node.x,
    right: node.x + NODE_WIDTH,
    top: node.y,
    bottom: node.y + node.height,
  }));
  for (const node of [...nodes].sort((a, b) => a.column - b.column || a.y - b.y)) {
    const width = labelWidth(node);
    const above = node.y - LABEL_ROOM / 2 + 2;
    const below = node.y + node.height + LABEL_ROOM / 2 - 2;
    const right = { x: node.x, anchor: "start" as const };
    const left = { x: node.x + NODE_WIDTH, anchor: "end" as const };
    const candidates: SankeyNode["labelAt"][] = outputs.has(node.id)
      ? [{ x: node.x + NODE_WIDTH + LABEL_INSET, y: node.y + node.height / 2, anchor: "start" }]
      : [
          { ...right, y: above },
          { ...left, y: above },
          { ...right, y: below },
          { ...left, y: below },
        ];
    const rectOf = ({ x, y, anchor }: SankeyNode["labelAt"]): Rect => ({
      left: anchor === "start" ? x : x - width,
      right: anchor === "start" ? x + width : x,
      top: y - LABEL_HEIGHT / 2,
      bottom: y + LABEL_HEIGHT / 2,
    });
    const cost = (at: SankeyNode["labelAt"]) => {
      const rect = rectOf(at);
      const outside = rect.left < 0 || rect.right > size.width || rect.top < 0 || rect.bottom > size.height;
      const onBands = traces.reduce((sum, band) => sum + coverage(band, rect), 0);
      const onOthers = [...bars, ...placed].reduce((sum, other) => sum + overlap(rect, other), 0);
      return (outside ? 1e6 : 0) + onBands + onOthers;
    };
    const best =
      nodes.length > CHECKED_LABELS
        ? (candidates[0] as SankeyNode["labelAt"])
        : candidates.reduce((chosen, candidate) => (cost(candidate) < cost(chosen) ? candidate : chosen));
    node.labelAt = best;
    placed.push(rectOf(best));
  }
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** How much of a rectangle a band covers: the overlap of each sample's band height, summed. */
function coverage({ points, half }: Trace, rect: Rect): number {
  let total = 0;
  for (const { x, y } of points) {
    if (x < rect.left || x > rect.right) continue;
    total += Math.max(0, Math.min(rect.bottom, y + half) - Math.max(rect.top, y - half));
  }
  return total;
}

function overlap(a: Rect, b: Rect): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

/** Moves the whole chart so it sits in the middle of the room it has. */
function centre(slots: Slot[], { top, bottom }: { top: number; bottom: number }): void {
  const highest = Math.min(...slots.map((slot) => slot.y));
  const lowest = Math.max(...slots.map((slot) => slot.y + slot.height));
  const shift = (top + bottom) / 2 - (highest + lowest) / 2;
  for (const slot of slots) slot.y += shift;
}

/** The edges that carry something, with how full their belts are. */
function edgeFlows(scene: CanvasScene, results: AnalysisResults, views: Map<LocalId, NodeView>): Flow[] {
  return scene.edges.flatMap((edge): Flow[] => {
    const result = results.edges[edge.id];
    const from = views.get(edge.source);
    const to = views.get(edge.target);
    if (!result || result.perSecond <= 0 || !from || !to) return [];
    const overflow = results.diagnostics.some(
      (diagnostic) => diagnostic.kind === "overflow" && diagnostic.edge === edge.id,
    );
    const saturation = flowSaturation({
      perSecond: result.perSecond,
      ...(result.capacity !== undefined && { capacity: result.capacity }),
      overflow,
    });
    const { id, source, target, item } = edge;
    return [{ id, source, target, item, perSecond: result.perSecond, saturation, backward: runsBack(from, to) }];
  });
}

/** A flow that runs right to left on the canvas closes a loop. */
function runsBack(from: NodeView, to: NodeView): boolean {
  return to.position.x <= from.position.x;
}

/**
 * Junctions pass their flows through: a junction's inflows are matched to its outflows in canvas order, each
 * taking what the other still has, so p inflows and c outflows become at most p + c − 1 bands from where the
 * items come from to where they go. A band through a full belt keeps that belt's warning. Junctions with nothing
 * coming in or nothing going out stay.
 */
function throughJunctions(flows: Flow[], views: Map<LocalId, NodeView>): Flow[] {
  let current = flows;
  const canvasY = (id: LocalId) => views.get(id)?.position.y ?? 0;
  for (const view of views.values()) {
    if (view.kind !== "junction") continue;
    const ins = current.filter((flow) => flow.target === view.id);
    const outs = current.filter((flow) => flow.source === view.id);
    if (ins.length === 0 || outs.length === 0) continue;
    const supply = ins
      .sort((a, b) => canvasY(a.source) - canvasY(b.source))
      .map((flow) => ({ flow, left: flow.perSecond }));
    const demand = outs
      .sort((a, b) => canvasY(a.target) - canvasY(b.target))
      .map((flow) => ({ flow, left: flow.perSecond }));
    const negligible = 1e-9 * Math.max(...supply.map((part) => part.left));
    const passed: Flow[] = [];
    let [i, o] = [0, 0];
    while (i < supply.length && o < demand.length) {
      const into = supply[i] as { flow: Flow; left: number };
      const out = demand[o] as { flow: Flow; left: number };
      const amount = Math.min(into.left, out.left);
      const [from, to] = [views.get(into.flow.source), views.get(out.flow.target)];
      if (amount > negligible && from && to && from.id !== to.id) {
        passed.push({
          id: `${into.flow.id}+${out.flow.id}`,
          source: from.id,
          target: to.id,
          item: into.flow.item,
          perSecond: amount,
          saturation: worse(into.flow.saturation, out.flow.saturation),
          backward: runsBack(from, to),
        });
      }
      into.left -= amount;
      out.left -= amount;
      if (into.left <= negligible) i++;
      if (out.left <= negligible) o++;
    }
    current = [...current.filter((flow) => flow.source !== view.id && flow.target !== view.id), ...passed];
  }
  return current;
}

const SEVERITY: FlowSaturation[] = ["unknown", "healthy", "near-capacity", "over-capacity"];
function worse(a: FlowSaturation, b: FlowSaturation): FlowSaturation {
  return SEVERITY.indexOf(a) >= SEVERITY.indexOf(b) ? a : b;
}

/**
 * Orders each column by the rate-weighted average position of what it connects to: down the columns by what
 * feeds them, then up by what they feed, several times over. Keeps the order with the fewest crossings, the
 * canvas's own order included.
 */
function orderColumns(stacks: Slot[][], segments: Segment[]): void {
  const position = new Map<Slot, number>();
  stacks.forEach((stack) => stack.forEach((slot, index) => position.set(slot, index)));
  const into = new Map<Slot, Segment[]>();
  const out = new Map<Slot, Segment[]>();
  for (const segment of segments) {
    into.set(segment.to, [...(into.get(segment.to) ?? []), segment]);
    out.set(segment.from, [...(out.get(segment.from) ?? []), segment]);
  }
  const sortBy = (stack: Slot[], neighbours: (slot: Slot) => { slot: Slot; perSecond: number }[]) => {
    const key = new Map(
      stack.map((slot, index) => {
        const around = neighbours(slot);
        const weight = around.reduce((sum, part) => sum + part.perSecond, 0);
        const centre = around.reduce((sum, part) => sum + part.perSecond * (position.get(part.slot) ?? 0), 0);
        return [slot, weight > 0 ? centre / weight : index] as const;
      }),
    );
    stack.sort((a, b) => (key.get(a) ?? 0) - (key.get(b) ?? 0));
    stack.forEach((slot, index) => position.set(slot, index));
  };
  let best = stacks.map((stack) => [...stack]);
  let fewest = crossings(segments, position);
  for (let sweep = 0; sweep < SWEEPS && fewest > 0; sweep++) {
    if (sweep % 2 === 0) {
      for (const stack of stacks.slice(1)) {
        sortBy(stack, (slot) => (into.get(slot) ?? []).map(({ from, perSecond }) => ({ slot: from, perSecond })));
      }
    } else {
      for (const stack of stacks.slice(0, -1).reverse()) {
        sortBy(stack, (slot) => (out.get(slot) ?? []).map(({ to, perSecond }) => ({ slot: to, perSecond })));
      }
    }
    const now = crossings(segments, position);
    if (now < fewest) {
      fewest = now;
      best = stacks.map((stack) => [...stack]);
    }
  }
  best.forEach((stack, index) => stacks[index]?.splice(0, stack.length, ...stack));
}

/** How much the bands between neighbouring columns cross: each crossing weighs the thinner band's rate. */
function crossings(segments: Segment[], position: Map<Slot, number>): number {
  const byColumn = new Map<number, Segment[]>();
  for (const segment of segments) {
    byColumn.set(segment.from.column, [...(byColumn.get(segment.from.column) ?? []), segment]);
  }
  let total = 0;
  for (const between of byColumn.values()) {
    for (const [index, a] of between.entries()) {
      for (const b of between.slice(index + 1)) {
        const left = (position.get(a.from) ?? 0) - (position.get(b.from) ?? 0);
        const right = (position.get(a.to) ?? 0) - (position.get(b.to) ?? 0);
        if (left * right < 0) total += Math.min(a.perSecond, b.perSecond);
      }
    }
  }
  return total;
}

/**
 * Nudges each slot level with what it connects to (weighted by rate), across the columns and back, a little less
 * each pass, pushing a column's slots apart after each move so they keep their order and stay on the chart.
 */
function relax(
  stacks: Slot[][],
  segments: Segment[],
  roomAbove: (slot: Slot) => number,
  bounds: { top: number; bottom: number },
): void {
  const neighbours = new Map<Slot, { slot: Slot; perSecond: number }[]>();
  const link = (slot: Slot, other: Slot, perSecond: number) =>
    neighbours.set(slot, [...(neighbours.get(slot) ?? []), { slot: other, perSecond }]);
  for (const { from, to, perSecond } of segments) {
    link(from, to, perSecond);
    link(to, from, perSecond);
  }
  const centre = (slot: Slot) => slot.y + slot.height / 2;
  for (let pass = 0; pass < RELAXATIONS; pass++) {
    const strength = 0.5 * 0.85 ** pass;
    for (const stack of pass % 2 === 0 ? stacks : [...stacks].reverse()) {
      for (const slot of stack) {
        const around = neighbours.get(slot) ?? [];
        const weight = around.reduce((sum, part) => sum + part.perSecond, 0);
        if (weight <= 0) continue;
        const wanted = around.reduce((sum, part) => sum + part.perSecond * centre(part.slot), 0) / weight;
        slot.y += (wanted - centre(slot)) * strength;
      }
      separate(stack, roomAbove, bounds);
    }
  }
}

/** Pushes a column's slots apart top to bottom, then back up from the bottom where they ran past it. */
function separate(stack: Slot[], roomAbove: (slot: Slot) => number, { top, bottom }: { top: number; bottom: number }) {
  let below = top;
  for (const [index, slot] of stack.entries()) {
    slot.y = Math.max(slot.y, below + (index > 0 ? roomAbove(slot) : 0));
    below = slot.y + slot.height;
  }
  let above = bottom;
  for (const slot of [...stack].reverse()) {
    slot.y = Math.min(slot.y, above - slot.height);
    above = slot.y - roomAbove(slot);
  }
}

/**
 * A forward band as one filled outline through its stops: from its source, a pair of stops level across each
 * column it passes, to its target. Odd steps run across a column; the others curve from one column to the next.
 */
function bandPath(stops: Point[], width: number): string {
  const start = stops[0] as Point;
  const end = stops[stops.length - 1] as Point;
  const edge = (points: Point[], offset: number) =>
    points
      .slice(1)
      .map((point, index) => {
        const previous = points[index] as Point;
        if (index % 2 === 1) return `L ${point.x} ${point.y + offset}`;
        const middle = (previous.x + point.x) / 2;
        return `C ${middle} ${previous.y + offset}, ${middle} ${point.y + offset}, ${point.x} ${point.y + offset}`;
      })
      .join(" ");
  const half = width / 2;
  const back = [...stops].reverse();
  return `M ${start.x} ${start.y - half} ${edge(stops, -half)} L ${end.x} ${end.y + half} ${edge(back, half)} Z`;
}

/** The centre line of a band through its stops (as `bandPath` draws it), sampled along each curve. */
function trace(stops: Point[]): Point[] {
  const points: Point[] = [stops[0] as Point];
  for (const [index, to] of stops.slice(1).entries()) {
    const from = stops[index] as Point;
    if (index % 2 === 1) {
      points.push(to);
      continue;
    }
    // The curve's control points sit halfway across, level with each end.
    const middle = (from.x + to.x) / 2;
    for (let step = 1; step <= SAMPLES; step++) {
      const t = step / SAMPLES;
      const [a, b, c, d] = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3];
      points.push({ x: a * from.x + (b + c) * middle + d * to.x, y: (a + b) * from.y + (c + d) * to.y });
    }
  }
  return points;
}

function labelOf(view: NodeView): string {
  switch (view.kind) {
    case "recipe":
      return view.title;
    case "source":
    case "sink":
      return view.item.name;
    case "junction":
      return view.item?.name ?? "Junction";
    default:
      return view.id;
  }
}

function itemOf(view: NodeView): Id | undefined {
  if (view.kind === "source" || view.kind === "sink") return view.item.id;
  if (view.kind === "junction") return view.item?.id;
  return undefined;
}

/** The longest path from a node without inputs, along flows that don't close a cycle. */
function ranks(ids: LocalId[], flows: { source: LocalId; target: LocalId }[]): Map<LocalId, number> {
  const out = new Map<LocalId, LocalId[]>(ids.map((id) => [id, []]));
  for (const flow of flows) out.get(flow.source)?.push(flow.target);
  // Whatever the canvas's layout, a cycle left among forward flows is broken where a depth-first walk closes it.
  const state = new Map<LocalId, "open" | "done">();
  const forward = new Map<LocalId, LocalId[]>(ids.map((id) => [id, []]));
  const visit = (id: LocalId) => {
    state.set(id, "open");
    for (const next of out.get(id) ?? []) {
      if (state.get(next) === "open") continue;
      forward.get(id)?.push(next);
      if (!state.has(next)) visit(next);
    }
    state.set(id, "done");
  };
  for (const id of ids) if (!state.has(id)) visit(id);

  const waiting = new Map(ids.map((id) => [id, 0]));
  for (const targets of forward.values())
    for (const target of targets) waiting.set(target, (waiting.get(target) ?? 0) + 1);
  const rank = new Map(ids.map((id) => [id, 0]));
  const ready = ids.filter((id) => waiting.get(id) === 0);
  while (ready.length > 0) {
    const id = ready.shift() as LocalId;
    for (const next of forward.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1));
      const left = (waiting.get(next) ?? 0) - 1;
      waiting.set(next, left);
      if (left === 0) ready.push(next);
    }
  }
  return rank;
}
