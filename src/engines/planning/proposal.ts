// Turns the superstructure's solve into a proposal: the recipes, raw inputs and outputs the plan uses, flows
// drawn straight from producers to consumers (the hubs dissolve), laid out left to right beside the
// document's factory, with ids the document doesn't use. Also sums the plan up for its summary card.
import type { Command } from "../../contracts/commands";
import type { Document, Edge, LocalId, Node, Position } from "../../contracts/document";
import type { Proposal, ProposalSummary } from "../../contracts/managers";
import type { Id, PackData } from "../../contracts/pack";
import type { AnalysisResults, EdgeResult, NodeResult } from "../../contracts/results";
import { clean } from "../../utilities/numbers";
import { layered, GRID, type LayoutNode } from "./layout";
import type { Role, Superstructure } from "./superstructure";

export interface ProposeInput {
  superstructure: Superstructure;
  /** The superstructure's solve. */
  results: AnalysisResults;
  pack: PackData;
  /** The document as it is now: the plan avoids its ids and goes beside its factory. */
  document: Document;
}

/** Room between the existing factory and the plan. */
const PLACEMENT_GAP = 8 * GRID;

interface Planned {
  id: LocalId;
  node: Node;
  role: LayoutNode["role"];
  result: NodeResult;
}

export function propose({ superstructure, results, pack, document }: ProposeInput): Proposal {
  const { roles, document: candidates } = superstructure;
  const fresh = idsBeside(document);
  const planned = new Map<LocalId, Planned>();
  const activity = (id: LocalId) => clean(results.nodes[id]?.activity ?? 0);

  // Superstructure id → proposal node, in the superstructure's order (raw inputs, recipes, targets).
  for (const [id, role] of Object.entries(roles)) {
    const node = candidates.graph.nodes[id];
    const result = results.nodes[id];
    if (!node || !result) continue;
    if (role.kind === "raw" && activity(id) > 0) {
      planned.set(id, {
        id: fresh(`source-${role.item}`),
        node: { kind: "source", item: role.item },
        role: "source",
        result,
      });
    } else if (role.kind === "recipe" && activity(id) > 0) {
      planned.set(id, { id: fresh(role.recipe), node, role: "between", result });
    } else if (role.kind === "target") {
      planned.set(id, { id: fresh(`output-${role.item}`), node, role: "target", result });
    } else if (role.kind === "spill" && activity(id) > 0) {
      // Byproducts get an output of their own next to what makes them.
      planned.set(id, { id: fresh(`byproduct-${role.item}`), node, role: "between", result });
    }
  }

  // Flows: each hub's producers matched to its consumers in order (users, the target, then the spill), so
  // every item takes a straight path.
  const flows: { from: LocalId; to: LocalId; item: Id; perSecond: number }[] = [];
  const edges = Object.entries(candidates.graph.edges);
  for (const [hub, role] of Object.entries(roles)) {
    if (role.kind !== "hub") continue;
    const side = (end: "from" | "to", other: "from" | "to") =>
      edges
        .filter(([, edge]) => edge[other] === hub && planned.has(edge[end]))
        .map(([id, edge]) => ({ node: edge[end], perSecond: clean(results.edges[id]?.perSecond ?? 0) }))
        .filter((part) => part.perSecond > 0);
    for (const flow of match(side("from", "to"), side("to", "from"))) flows.push({ ...flow, item: role.item });
  }

  // Layout, then the whole plan moved beside the factory.
  const nodes = [...planned.values()];
  const size = (entry: Planned) => sizeOf(entry.node, pack);
  const at = layered(
    nodes.map((entry) => ({ id: entry.id, role: entry.role, ...size(entry) })),
    flows.map((flow) => ({ from: planned.get(flow.from)?.id ?? "", to: planned.get(flow.to)?.id ?? "" })),
  );
  const offset = placement(document, pack);

  const commands: Command[] = [];
  const nodeResults: Record<LocalId, NodeResult> = {};
  for (const entry of nodes) {
    const point = at[entry.id] ?? { x: 0, y: 0 };
    commands.push({
      type: "addNode",
      graph: "root",
      id: entry.id,
      node: entry.node,
      position: { x: point.x + offset.x, y: point.y + offset.y },
    });
    nodeResults[entry.id] = entry.result;
  }
  const edgeResults: Record<LocalId, EdgeResult> = {};
  for (const flow of flows) {
    const from = planned.get(flow.from)?.id as LocalId;
    const to = planned.get(flow.to)?.id as LocalId;
    const id = fresh(`${from}-${to}`);
    const edge: Edge = { from, to, item: flow.item };
    commands.push({ type: "connect", graph: "root", id, edge });
    edgeResults[id] = { perSecond: flow.perSecond };
  }

  return {
    documentId: document.id,
    targets: superstructure.targets,
    commands,
    results: { nodes: nodeResults, edges: edgeResults },
    summary: summarise(planned, roles, results, pack),
  };
}

function summarise(
  planned: Map<LocalId, Planned>,
  roles: Record<LocalId, Role>,
  results: AnalysisResults,
  pack: PackData,
): ProposalSummary {
  const buildings: Record<Id, number> = {};
  const raw: Record<Id, number> = {};
  const byproducts: Record<Id, number> = {};
  let powerMW = 0;
  const recipes = new Map(pack.recipes.map((recipe) => [recipe.id, recipe]));
  const buildingsById = new Map(pack.buildings.map((building) => [building.id, building]));
  for (const [id, entry] of planned) {
    const role = roles[id];
    const machines = clean(entry.result.activity);
    if (role?.kind === "raw") raw[role.item] = machines;
    if (role?.kind === "spill") byproducts[role.item] = machines;
    if (role?.kind !== "recipe" || entry.node.kind !== "recipe") continue;
    const buildingId = entry.node.building ?? recipes.get(role.recipe)?.buildings[0];
    if (buildingId === undefined) continue;
    // Own keys only: an id such as Satisfactory's "constructor" would otherwise start from Object.prototype's.
    const counted = Object.hasOwn(buildings, buildingId) ? (buildings[buildingId] ?? 0) : 0;
    buildings[buildingId] = counted + Math.ceil(machines);
    // The plugin's power metric (Satisfactory's `power`, in MW) where it derives one.
    const derived = entry.result.derived?.power ?? entry.result.derived?.powerMW;
    powerMW += derived ?? (buildingsById.get(buildingId)?.power?.consume ?? 0) * machines;
  }
  const shortfalls: Record<Id, number> = {};
  for (const diagnostic of results.diagnostics) {
    if (diagnostic.kind === "deficit")
      shortfalls[diagnostic.item] = (shortfalls[diagnostic.item] ?? 0) + diagnostic.perSecond;
  }
  return { buildings, raw, byproducts, shortfalls, powerMW };
}

/**
 * Pairs producers with consumers in order, each taking what the other still has (the north-west corner
 * rule), so a hub of p producers and c consumers becomes at most p + c − 1 direct flows.
 */
function match(
  producers: { node: LocalId; perSecond: number }[],
  consumers: { node: LocalId; perSecond: number }[],
): { from: LocalId; to: LocalId; perSecond: number }[] {
  const total = producers.reduce((sum, part) => sum + part.perSecond, 0);
  const negligible = total * 1e-9;
  const supply = producers.map((part) => ({ ...part }));
  const demand = consumers.map((part) => ({ ...part }));
  const flows: { from: LocalId; to: LocalId; perSecond: number }[] = [];
  let [p, c] = [0, 0];
  while (p < supply.length && c < demand.length) {
    const producer = supply[p] as { node: LocalId; perSecond: number };
    const consumer = demand[c] as { node: LocalId; perSecond: number };
    const amount = Math.min(producer.perSecond, consumer.perSecond);
    if (amount > negligible) flows.push({ from: producer.node, to: consumer.node, perSecond: clean(amount) });
    producer.perSecond -= amount;
    consumer.perSecond -= amount;
    if (producer.perSecond <= negligible) p++;
    if (consumer.perSecond <= negligible) c++;
  }
  return flows;
}

/** Ids not yet used by the document's nodes and edges (nor by the plan): `smelt`, then `smelt-2` … */
function idsBeside(document: Document): (base: string) => LocalId {
  const taken = new Set([...Object.keys(document.graph.nodes), ...Object.keys(document.graph.edges)]);
  return (base) => {
    let id = base;
    for (let suffix = 2; taken.has(id); suffix++) id = `${base}-${suffix}`;
    taken.add(id);
    return id;
  };
}

/** Where the plan's top-left corner goes: right of the factory, level with its top; the origin when empty. */
function placement(document: Document, pack: PackData): { x: number; y: number } {
  const layout = document.layout.root ?? {};
  const rects = Object.entries(document.graph.nodes).flatMap(([id, node]) => {
    const position = layout[id];
    return position ? [{ ...position, ...sizeOf(node, pack, position) }] : [];
  });
  if (rects.length === 0) return { x: 0, y: 0 };
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const top = Math.min(...rects.map((rect) => rect.y));
  return { x: Math.ceil((right + PLACEMENT_GAP) / GRID) * GRID, y: Math.round(top / GRID) * GRID };
}

/**
 * About the size a node is drawn at: the canvas's geometry (src/client/canvas/model/geometry.ts), which the
 * engines can't import. Close is enough here: the layout only needs room between cards.
 */
function sizeOf(node: Node, pack: PackData, position?: Position): { width: number; height: number } {
  switch (node.kind) {
    case "recipe": {
      const recipe = pack.recipes.find((candidate) => candidate.id === node.recipe);
      const rows = Object.keys(recipe?.in ?? {}).length + Object.keys(recipe?.out ?? {}).length;
      return { width: 312, height: 100 + 28 * Math.max(rows, 1) };
    }
    case "junction":
      return { width: 48, height: 48 };
    case "note":
      return { width: position?.width ?? 240, height: position?.height ?? 120 };
    case "frame":
      return { width: position?.width ?? 480, height: position?.height ?? 312 };
    default:
      return { width: 264, height: 72 };
  }
}
