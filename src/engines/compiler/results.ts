// Turns the solver's answer for a compiled document back into results per node and edge, diagnostics
// and totals, in the document's own ids. Calls the plugin's `derive` hook for post-solve metrics.
import type { Id } from "../../contracts/pack";
import type { Plugin } from "../../contracts/plugin";
import type { Result } from "../../contracts/result";
import type { AnalysisResults, Diagnostic, EdgeResult, NodeResult } from "../../contracts/results";
import type { Solution, Unsolvable } from "../../contracts/solver";
import { clean } from "../../utilities/numbers";
import type { Compiled } from "./compile";

const UNSOLVABLE: Record<Unsolvable, string> = {
  infeasible: "The pack's constraints contradict each other; nothing could be solved",
  unbounded: "A negative cost makes the plan grow without limit; nothing could be solved",
};

export function toResults(
  compiled: Compiled,
  outcome: Result<Solution, Unsolvable>,
  plugin: Plugin,
  version: number,
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

  // Edge indices per node, so junctions don't scan every edge.
  const incoming: number[][] = model.nodes.map(() => []);
  const outgoing: number[][] = model.nodes.map(() => []);
  model.edges.forEach((edge, e) => {
    incoming[edge.to]?.push(e);
    outgoing[edge.from]?.push(e);
  });

  const nodes: Record<string, NodeResult> = {};
  model.nodes.forEach((modelNode, index) => {
    const activity = solution.activity[index] ?? 0;
    const inputs: Record<Id, number> = {};
    const outputs: Record<Id, number> = {};
    const add = (amounts: Record<Id, number>, id: Id, amount: number) => (amounts[id] = (amounts[id] ?? 0) + amount);
    for (const rate of modelNode.rates) {
      if (rate.perSecond < 0) add(inputs, item(rate.item), -rate.perSecond * activity);
      else add(outputs, item(rate.item), rate.perSecond * activity);
    }
    if (modelNode.kind === "junction") {
      for (const e of incoming[index] ?? []) add(inputs, item(model.edges[e]?.item ?? 0), solution.flow[e] ?? 0);
      for (const e of outgoing[index] ?? []) add(outputs, item(model.edges[e]?.item ?? 0), solution.flow[e] ?? 0);
    }
    const context = compiled.info[index]?.context;
    const derived = context && plugin.derive?.({ ...context, machines: activity }, compiled.context);
    nodes[node(index)] = { activity, inputs, outputs, ...(derived && { derived }) };
  });

  const edges: Record<string, EdgeResult> = {};
  model.edges.forEach((edge, index) => {
    edges[compiled.edges[index] as string] = {
      perSecond: solution.flow[index] ?? 0,
      ...(edge.capacity !== undefined && { capacity: edge.capacity }),
    };
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
      // Noise such as 3.00000001 machines must not round up to 4.
      // Own keys only: an id such as "constructor" would otherwise start from Object.prototype's.
      const counted = Object.hasOwn(buildings, building) ? (buildings[building] ?? 0) : 0;
      buildings[building] = counted + Math.ceil(clean(activity));
    }
  });

  return { ...base, nodes, edges, diagnostics, totals: { raw, buildings } };
}
