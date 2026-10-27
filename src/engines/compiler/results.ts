// Turns the solver's answer for a compiled document back into results per node and edge, diagnostics
// and totals, in the document's own ids. Calls the plugin's `derive` hook for post-solve metrics.
// Incremental: given the memo of the document's last mapping, nodes and edges whose model and numbers didn't
// change keep their result objects (clients re-render only what changed) and skip the plugin's hooks.
import type { LocalId } from "../../contracts/document";
import type { Id } from "../../contracts/pack";
import type { Plugin, PluginContext } from "../../contracts/plugin";
import type { Result } from "../../contracts/result";
import type { AnalysisResults, Diagnostic, EdgeResult, NodeResult } from "../../contracts/results";
import type { InstanceSolution, ModelEdge, ModelNode, Solution, Unsolvable } from "../../contracts/solver";
import { clean } from "../../utilities/numbers";
import type { Compiled, NodeInfo } from "./compile";
import { addBoundaryFlows, addInsideTotals, inlineHints, type InsideMemo } from "./instances";

/**
 * What the last mapping of a document's results remembers for the next one. Opaque to callers: create one with
 * `resultsMemo()` and pass it to every mapping of one graph of one document.
 */
export interface ResultsMemo {
  inputs?: { plugin: Plugin; context: PluginContext; documentId: string; graph: string };
  /** The node and edge ids of the last mapping, and what it mapped them to, in model order. */
  nodeIds: LocalId[];
  nodes: (NodeMemo | undefined)[];
  edgeIds: LocalId[];
  edges: (EdgeMemo | undefined)[];
  /** What each instance adds to the totals, by the instance solution it was counted from. */
  inside: InsideMemo;
}

export function resultsMemo(): ResultsMemo {
  return { nodeIds: [], nodes: [], edgeIds: [], edges: [], inside: { insides: [], adds: [] } };
}

interface NodeMemo {
  model: ModelNode;
  info: NodeInfo | undefined;
  activity: number;
  inside: InstanceSolution | undefined;
  result: NodeResult;
  /** Recipe nodes: machines counted in the totals. */
  machines: number;
}

interface EdgeMemo {
  model: ModelEdge;
  flow: number;
  result: EdgeResult;
}

const UNSOLVABLE: Record<Unsolvable, string> = {
  infeasible: "The pack's constraints contradict each other; nothing could be solved",
  unbounded: "A negative cost makes the plan grow without limit; nothing could be solved",
};

export function toResults(
  compiled: Compiled,
  outcome: Result<Solution, Unsolvable>,
  plugin: Plugin,
  version: number,
  memo: ResultsMemo = resultsMemo(),
): AnalysisResults {
  const base = { documentId: compiled.documentId, version, graph: compiled.graph };
  if (!outcome.ok) {
    return {
      ...base,
      nodes: {},
      edges: {},
      diagnostics: [...compiled.diagnostics, { kind: "error", message: UNSOLVABLE[outcome.error] }],
      totals: { raw: {}, buildings: {} },
    };
  }
  const solution = outcome.value;
  const { model } = compiled;
  const item = (index: number) => compiled.items[index] as Id;
  const node = (index: number) => compiled.nodes[index] as string;
  const inputs = memo.inputs;
  if (
    !inputs ||
    inputs.plugin !== plugin ||
    inputs.context !== compiled.context ||
    inputs.documentId !== compiled.documentId ||
    inputs.graph !== compiled.graph
  ) {
    // Derived metrics depend on the plugin and its context: nothing mapped before can be reused.
    memo.inputs = { plugin, context: compiled.context, documentId: compiled.documentId, graph: compiled.graph };
    memo.nodeIds = memo.edgeIds = [];
    memo.nodes = memo.edges = [];
  }
  // By model index; looked up by id only when nodes or edges came or went.
  const sameEdges = sameIds(memo.edgeIds, compiled.edges);
  const nodeMemos = aligned(memo.nodeIds, memo.nodes, compiled.nodes);
  const edgeMemos = aligned(memo.edgeIds, memo.edges, compiled.edges);
  Object.assign(memo, { nodeIds: compiled.nodes, nodes: nodeMemos, edgeIds: compiled.edges, edges: edgeMemos });

  // Nodes to map again: an edge whose flow changed changes what the junctions at its ends pass on.
  const stale = new Uint8Array(model.nodes.length);
  const edges: Record<string, EdgeResult> = {};
  for (let index = 0; index < model.edges.length; index++) {
    const edge = model.edges[index] as ModelEdge;
    const flow = solution.flow[index] ?? 0;
    let known = edgeMemos[index];
    if (!known || known.model !== edge || known.flow !== flow) {
      const result = { perSecond: flow, ...(edge.capacity !== undefined && { capacity: edge.capacity }) };
      edgeMemos[index] = known = { model: edge, flow, result };
      stale[edge.from] = 1;
      stale[edge.to] = 1;
    }
    edges[compiled.edges[index] as LocalId] = known.result;
  }
  // An edge that went away changed its junctions too, but which they were is gone with it.
  if (!sameEdges) stale.fill(1);
  const insideOf: (InstanceSolution | undefined)[] = [];
  for (const inside of solution.instances ?? []) insideOf[inside.node] = inside;
  for (let index = 0; index < model.nodes.length; index++) {
    const modelNode = model.nodes[index] as ModelNode;
    if (stale[index] === 1 && modelNode.kind === "junction") continue;
    const known = nodeMemos[index];
    const same =
      known?.model === modelNode &&
      known.info === compiled.info[index] &&
      known.activity === (solution.activity[index] ?? 0) &&
      known.inside === insideOf[index];
    stale[index] = same ? 0 : 1;
  }

  // Edge indices per junction mapped again, so junctions don't scan every edge.
  const incoming = new Map<number, number[]>();
  const outgoing = new Map<number, number[]>();
  const junction = (index: number) => stale[index] === 1 && model.nodes[index]?.kind === "junction";
  const add = (edges: Map<number, number[]>, node: number, edge: number) => {
    const known = edges.get(node);
    if (known) known.push(edge);
    else edges.set(node, [edge]);
  };
  model.edges.forEach((edge, e) => {
    if (junction(edge.to)) add(incoming, edge.to, e);
    if (junction(edge.from)) add(outgoing, edge.from, e);
  });

  const nodes: Record<string, NodeResult> = {};
  model.nodes.forEach((modelNode, index) => {
    const id = node(index);
    let known = nodeMemos[index];
    if (!known || stale[index] === 1) {
      const activity = solution.activity[index] ?? 0;
      const info = compiled.info[index];
      const inside = insideOf[index];
      const inputs: Record<Id, number> = {};
      const outputs: Record<Id, number> = {};
      const add = (amounts: Record<Id, number>, id: Id, amount: number) => (amounts[id] = (amounts[id] ?? 0) + amount);
      for (const rate of modelNode.rates) {
        if (rate.perSecond < 0) add(inputs, item(rate.item), -rate.perSecond * activity);
        else add(outputs, item(rate.item), rate.perSecond * activity);
      }
      if (modelNode.kind === "junction") {
        for (const e of incoming.get(index) ?? []) add(inputs, item(model.edges[e]?.item ?? 0), solution.flow[e] ?? 0);
        for (const e of outgoing.get(index) ?? []) add(outputs, item(model.edges[e]?.item ?? 0), solution.flow[e] ?? 0);
      }
      if (inside) addBoundaryFlows(info ?? { kind: "instance" }, inside, inputs, outputs);
      const context = info?.context;
      const derived = context && plugin.derive?.({ ...context, machines: activity }, compiled.context);
      // Noise such as 3.00000001 machines must not round up to 4.
      const machines = context && activity > 0 ? Math.ceil(clean(activity)) : 0;
      const result = { activity, inputs, outputs, ...(derived && { derived }) };
      nodeMemos[index] = known = { model: modelNode, info, activity, inside, result, machines };
    }
    nodes[id] = known.result;
  });

  const diagnostics: Diagnostic[] = [
    ...compiled.diagnostics,
    ...solution.surplus.map((slack): Diagnostic => ({
      kind: "surplus",
      node: node(slack.node),
      item: item(slack.item),
      perSecond: slack.perSecond,
    })),
    ...solution.deficit.map((slack): Diagnostic => ({
      kind: "deficit",
      node: node(slack.node),
      item: item(slack.item),
      perSecond: slack.perSecond,
    })),
    ...solution.overflow.map((slack): Diagnostic => ({
      kind: "overflow",
      edge: compiled.edges[slack.edge] as string,
      perSecond: slack.perSecond,
    })),
    // In the pin's own unit: machines, or items per second for a rate pin.
    ...solution.pinMisses.map((miss): Diagnostic => ({
      kind: "pinMiss",
      node: node(miss.node),
      difference: miss.difference * (compiled.info[miss.node]?.pinRate ?? 1),
    })),
    ...inlineHints(compiled, solution),
  ];

  const raw: Record<Id, number> = {};
  const buildings: Record<Id, number> = {};
  model.nodes.forEach((modelNode, index) => {
    const info = compiled.info[index];
    const activity = solution.activity[index] ?? 0;
    if (activity <= 0) return;
    if (info?.kind === "source") {
      for (const rate of modelNode.rates) raw[item(rate.item)] = (raw[item(rate.item)] ?? 0) + activity;
    }
    if (info?.context) {
      const building = info.context.building.id;
      // Own keys only: an id such as "constructor" would otherwise start from Object.prototype's.
      const counted = Object.hasOwn(buildings, building) ? (buildings[building] ?? 0) : 0;
      buildings[building] = counted + (nodeMemos[index] as NodeMemo).machines;
    }
  });
  addInsideTotals(compiled, solution, raw, buildings, memo.inside);

  return { ...base, nodes, edges, diagnostics, totals: { raw, buildings } };
}

function sameIds(a: LocalId[], b: LocalId[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let at = 0; at < a.length; at++) if (a[at] !== b[at]) return false;
  return true;
}

/** What was remembered for `before`'s ids, at their positions in `after`. */
function aligned<T>(before: LocalId[], memos: T[], after: LocalId[]): (T | undefined)[] {
  if (sameIds(before, after)) return memos;
  const byId = new Map(before.map((id, at) => [id, memos[at]]));
  return after.map((id) => byId.get(id));
}
