// Builds a scene's document and matching results from a compact description. Recipe results follow from
// the machine count and the pack; edges carry the rates written down, and sources, sinks and junctions add
// up their edges. Dev and test fixture only: real results come from the analysis manager.
import { CURRENT_DOCUMENT_VERSION, type Document, type Edge, type Node } from "../../../contracts/document";
import type { Id, PackData, RateUnit } from "../../../contracts/pack";
import type { AnalysisResults, Diagnostic, NodeResult } from "../../../contracts/results";

export interface SceneNode {
  node: Node;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Machine count of a recipe node. */
  machines?: number;
}

export interface SceneSpec {
  name: string;
  rateUnit?: RateUnit;
  nodes: Record<string, SceneNode>;
  edges: Record<string, Edge & { perSecond: number }>;
  diagnostics?: Diagnostic[];
}

export interface Scene {
  document: Document;
  results: AnalysisResults;
}

export function buildScene(pack: PackData, spec: SceneSpec): Scene {
  const nodes: Document["graph"]["nodes"] = {};
  const layout: Document["layout"][string] = {};
  for (const [id, { node, x, y, width, height }] of Object.entries(spec.nodes)) {
    nodes[id] = node;
    layout[id] = { x, y, ...(width && { width }), ...(height && { height }) };
  }
  const edges: Document["graph"]["edges"] = {};
  for (const [id, { perSecond: _rate, ...edge }] of Object.entries(spec.edges)) edges[id] = edge;

  const document: Document = {
    format: "carbonara",
    version: CURRENT_DOCUMENT_VERSION,
    id: `scene-${spec.name}`,
    name: spec.name,
    pack: { id: "template", version: "1.0.0", hash: "scene" },
    graph: { nodes, edges },
    blueprints: {},
    layout: { root: layout },
    settings: spec.rateUnit ? { rateUnit: spec.rateUnit } : {},
  };
  return { document, results: resultsOf(pack, spec) };
}

function resultsOf(pack: PackData, spec: SceneSpec): AnalysisResults {
  const recipes = new Map(pack.recipes.map((recipe) => [recipe.id, recipe]));
  const speeds = new Map(pack.buildings.map((building) => [building.id, building.speed]));
  const capacities = new Map(pack.logistics.map((logistics) => [logistics.id, logistics.capacity]));
  const toPerSecond = { per_second: 1, per_minute: 1 / 60, per_hour: 1 / 3600 }[pack.units.rate];

  const nodes: Record<string, NodeResult> = {};
  for (const [id, { node, machines }] of Object.entries(spec.nodes)) {
    if (node.kind === "recipe") {
      const recipe = recipes.get(node.recipe);
      if (!recipe || machines === undefined) continue;
      const crafts = (machines * (speeds.get(node.building ?? recipe.buildings[0] ?? "") ?? 1)) / recipe.time;
      nodes[id] = { activity: machines, inputs: scale(recipe.in, crafts), outputs: scale(recipe.out, crafts) };
    } else if (node.kind === "source" || node.kind === "sink" || node.kind === "junction") {
      nodes[id] = { activity: 0, inputs: {}, outputs: {} };
    }
  }

  const edges: AnalysisResults["edges"] = {};
  for (const [id, edge] of Object.entries(spec.edges)) {
    const capacity = edge.logistics && capacities.get(edge.logistics);
    edges[id] = { perSecond: edge.perSecond, ...(capacity && { capacity: capacity * toPerSecond }) };
    const from = nodes[edge.from];
    const to = nodes[edge.to];
    if (from && spec.nodes[edge.from]?.node.kind !== "recipe") add(from.outputs, edge.item, edge.perSecond);
    if (to && spec.nodes[edge.to]?.node.kind !== "recipe") add(to.inputs, edge.item, edge.perSecond);
  }
  for (const [id, result] of Object.entries(nodes)) {
    const kind = spec.nodes[id]?.node.kind;
    if (kind === "source") result.activity = sum(result.outputs);
    if (kind === "sink" || kind === "junction") result.activity = sum(result.inputs);
  }

  return {
    documentId: `scene-${spec.name}`,
    version: 1,
    graph: "root",
    nodes,
    edges,
    diagnostics: spec.diagnostics ?? [],
    totals: { raw: {}, buildings: {} },
  };
}

function scale(amounts: Record<Id, number>, factor: number): Record<Id, number> {
  return Object.fromEntries(Object.entries(amounts).map(([item, amount]) => [item, amount * factor]));
}

function add(rates: Record<Id, number>, item: Id, perSecond: number) {
  rates[item] = (rates[item] ?? 0) + perSecond;
}

function sum(rates: Record<Id, number>): number {
  return Object.values(rates).reduce((total, rate) => total + rate, 0);
}
