// The Sankey overview's layout: the whole factory as columns of nodes, left to right in the direction of flow,
// joined by bands as wide as their rates. Nodes keep the vertical order they have on the canvas, so the overview
// reads like the factory; recycling loops (flows that run right to left on the canvas) loop back below it.
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
}

export interface SankeyLink {
  id: LocalId;
  source: LocalId;
  target: LocalId;
  item: Id;
  perSecond: number;
  width: number;
  /** A forward band's outline, to fill; a loop's centre line, to stroke `width` wide. */
  path: string;
  backward: boolean;
  saturation: FlowSaturation;
}

export interface SankeyLayout {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export const NODE_WIDTH = 14;
/** Room around the chart for labels, and between nodes in a column. */
const MARGIN = { top: 24, right: 160, bottom: 24, left: 24 };
const GAP = 20;
/** The fullest column fills this share of the height; the rest is air, so the bands read as shapes. */
const FILL = 0.75;
/** How far recycling loops run below the chart, and apart from each other. */
const LOOP_DROP = 18;
const MIN_HEIGHT = 2;

type Kind = SankeyNode["kind"];
const KINDS = new Set<string>(["recipe", "source", "sink", "junction"]);

export function sankeyLayout(
  scene: CanvasScene,
  results: AnalysisResults | null,
  size: { width: number; height: number },
): SankeyLayout {
  if (!results) return { nodes: [], links: [] };
  const views = new Map(scene.nodes.filter((view) => KINDS.has(view.kind)).map((view) => [view.id, view]));
  const flows = scene.edges.flatMap((edge) => {
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
    // A flow that runs right to left on the canvas closes a loop.
    const backward = to.position.x <= from.position.x;
    return [
      {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        item: edge.item,
        perSecond: result.perSecond,
        saturation,
        backward,
      },
    ];
  });
  const used = [...views.values()].filter((view) =>
    flows.some((flow) => flow.source === view.id || flow.target === view.id),
  );
  if (used.length === 0) return { nodes: [], links: [] };

  // Columns: the longest path along forward flows; sources first, sinks last.
  const column = ranks(
    used.map((view) => view.id),
    flows.filter((flow) => !flow.backward),
  );
  const last = Math.max(...column.values());
  for (const view of used) {
    if (view.kind === "source") column.set(view.id, 0);
    if (view.kind === "sink") column.set(view.id, Math.max(last, 1));
  }
  const columns = Math.max(...column.values()) + 1;

  const throughput = new Map(
    used.map((view) => {
      const sum = (end: "source" | "target") =>
        flows.filter((flow) => flow[end] === view.id).reduce((total, flow) => total + flow.perSecond, 0);
      return [view.id, Math.max(sum("source"), sum("target"))];
    }),
  );

  // One scale for every band: the fullest column fills the height left after the gaps (and room for loops).
  const loops = flows.filter((flow) => flow.backward).length;
  const height = size.height - MARGIN.top - MARGIN.bottom - (loops > 0 ? LOOP_DROP * (loops + 1) : 0);
  const stacks = Array.from({ length: columns }, (_, index) =>
    used
      .filter((view) => column.get(view.id) === index)
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x),
  );
  const scale = Math.min(
    ...stacks
      .filter((stack) => stack.length > 0)
      .map((stack) => {
        const total = stack.reduce((sum, view) => sum + (throughput.get(view.id) ?? 0), 0);
        return total > 0 ? (FILL * height - GAP * (stack.length - 1)) / total : Infinity;
      }),
  );

  const span = size.width - MARGIN.left - MARGIN.right - NODE_WIDTH;
  const nodes = new Map<LocalId, SankeyNode>();
  for (const [index, stack] of stacks.entries()) {
    const heights = stack.map((view) => Math.max(MIN_HEIGHT, (throughput.get(view.id) ?? 0) * scale));
    const total = heights.reduce((sum, value) => sum + value, 0) + GAP * Math.max(0, stack.length - 1);
    let y = MARGIN.top + (height - total) / 2;
    for (const [position, view] of stack.entries()) {
      const nodeHeight = heights[position] ?? MIN_HEIGHT;
      nodes.set(view.id, {
        id: view.id,
        kind: view.kind as Kind,
        label: labelOf(view),
        ...(itemOf(view) !== undefined && { item: itemOf(view) as Id }),
        column: index,
        x: MARGIN.left + (columns > 1 ? (span * index) / (columns - 1) : span / 2),
        y,
        height: nodeHeight,
        throughput: throughput.get(view.id) ?? 0,
      });
      y += nodeHeight + GAP;
    }
  }

  // Bands leave a node in the order their other ends sit, and arrive likewise, so they cross as little as can be.
  const offsets = new Map<string, number>();
  const centreOf = (id: LocalId) => {
    const node = nodes.get(id);
    return node ? node.y + node.height / 2 : 0;
  };
  const attach = (end: "source" | "target", other: "source" | "target") => {
    for (const node of nodes.values()) {
      let offset = 0;
      const attached = flows
        .filter((flow) => flow[end] === node.id)
        .sort((a, b) => Number(a.backward) - Number(b.backward) || centreOf(a[other]) - centreOf(b[other]));
      for (const flow of attached) {
        const width = flow.perSecond * scale;
        offsets.set(`${end}:${flow.id}`, node.y + offset + width / 2);
        offset += width;
      }
    }
  };
  attach("source", "target");
  attach("target", "source");

  const bottom = MARGIN.top + height;
  let loop = 0;
  const links = flows.map((flow): SankeyLink => {
    const from = nodes.get(flow.source) as SankeyNode;
    const to = nodes.get(flow.target) as SankeyNode;
    const width = flow.perSecond * scale;
    const x0 = from.x + NODE_WIDTH;
    const x1 = to.x;
    const y0 = offsets.get(`source:${flow.id}`) ?? 0;
    const y1 = offsets.get(`target:${flow.id}`) ?? 0;
    let path: string;
    if (flow.backward) {
      loop += 1;
      const below = bottom + LOOP_DROP * loop;
      const bend = Math.max(24, width);
      path =
        `M ${x0} ${y0} C ${x0 + bend} ${y0}, ${x0 + bend} ${below}, ${x0} ${below} ` +
        `L ${x1} ${below} C ${x1 - bend} ${below}, ${x1 - bend} ${y1}, ${x1} ${y1}`;
    } else {
      // A filled band between two curves: a wide stroke would fold over itself on steep bends.
      const middle = (x0 + x1) / 2;
      const [top0, top1, bottom0, bottom1] = [y0 - width / 2, y1 - width / 2, y0 + width / 2, y1 + width / 2];
      path =
        `M ${x0} ${top0} C ${middle} ${top0}, ${middle} ${top1}, ${x1} ${top1} ` +
        `L ${x1} ${bottom1} C ${middle} ${bottom1}, ${middle} ${bottom0}, ${x0} ${bottom0} Z`;
    }
    return { ...flow, width, path };
  });

  return { nodes: [...nodes.values()], links };
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
