// Turns the superstructure's solve into a proposal: the recipes, raw inputs and outputs the plan uses, flows
// drawn straight from producers to consumers (the hubs dissolve) on the smallest belt or pipe that carries them,
// with ids the document doesn't use. Also sums the plan up for its summary card, says how its nodes are drawn
// (for the layout engine) and places the laid-out plan beside the document's factory.
import type { Command } from "../../contracts/commands";
import type { Document, Edge, Graph, LocalId, Node, Position } from "../../contracts/document";
import type { NodeShape, PortShape } from "../../contracts/layout";
import type { Proposal, ProposalSummary } from "../../contracts/managers";
import type { Id, PackData } from "../../contracts/pack";
import type { AnalysisResults, EdgeResult, NodeResult } from "../../contracts/results";
import { clean } from "../../utilities/numbers";
import { addTo } from "../../utilities/records";
import { toPerSecond } from "../../utilities/units";
import type { Role, Superstructure } from "./superstructure";

export interface ProposeInput {
  superstructure: Superstructure;
  /** The superstructure's solve. */
  results: AnalysisResults;
  pack: PackData;
  /** The document as it is now: the plan avoids its ids. */
  document: Document;
}

/** The canvas's grid pitch (src/client/canvas/model/geometry.ts); the plan's corner lands on it. */
export const GRID = 24;
/** Room between the existing factory and the plan. */
const PLACEMENT_GAP = 8 * GRID;

interface Planned {
  id: LocalId;
  node: Node;
  result: NodeResult;
}

type Point = { x: number; y: number };

/** The proposal, with every node at the origin until it's laid out (`proposalLayout`, `placeBeside`). */
export function propose({ superstructure, results, pack, document }: ProposeInput): Omit<Proposal, "id"> {
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
      planned.set(id, { id: fresh(`source-${role.item}`), node: { kind: "source", item: role.item }, result });
    } else if (role.kind === "recipe" && activity(id) > 0) {
      planned.set(id, { id: fresh(role.recipe), node, result });
    } else if (role.kind === "target") {
      planned.set(id, { id: fresh(`output-${role.item}`), node, result });
    } else if (role.kind === "spill" && activity(id) > 0) {
      // Byproducts get an output of their own next to what makes them.
      planned.set(id, { id: fresh(`byproduct-${role.item}`), node, result });
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

  const commands: Command[] = [];
  const nodeResults: Record<LocalId, NodeResult> = {};
  for (const entry of planned.values()) {
    commands.push({ type: "addNode", graph: "root", id: entry.id, node: entry.node, position: { x: 0, y: 0 } });
    nodeResults[entry.id] = entry.result;
  }
  const edgeResults: Record<LocalId, EdgeResult> = {};
  const carriers = logisticsByItem(pack);
  for (const flow of flows) {
    const from = planned.get(flow.from)?.id as LocalId;
    const to = planned.get(flow.to)?.id as LocalId;
    const id = fresh(`${from}-${to}`);
    const logistics = carriers(flow.item, flow.perSecond);
    const edge: Edge = { from, to, item: flow.item, ...(logistics !== undefined && { logistics }) };
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

/** The proposal's graph and how its nodes are drawn: what the layout engine's `arrange` needs. */
export function proposalLayout(
  { commands }: Pick<Proposal, "commands">,
  pack: PackData,
): { graph: Graph; shapes: Record<LocalId, NodeShape> } {
  const graph: Graph = { nodes: {}, edges: {} };
  const shapes: Record<LocalId, NodeShape> = {};
  for (const command of commands) {
    if (command.type === "addNode" && command.id !== undefined) {
      graph.nodes[command.id] = command.node;
      shapes[command.id] = shapeOf(command.node, pack);
    } else if (command.type === "connect" && command.id !== undefined) {
      graph.edges[command.id] = command.edge;
    }
  }
  return { graph, shapes };
}

/**
 * The proposal laid out at `at` (by node id, as `arrange` answers), moved as a block beside the document's
 * factory: right of it with a gap, level with its top, or at the origin in an empty document.
 */
export function placeBeside<P extends Pick<Proposal, "commands">>(
  proposal: P,
  at: Record<LocalId, Point>,
  document: Document,
  pack: PackData,
): P {
  const laid = Object.values(at);
  const corner = { x: Math.min(...laid.map(({ x }) => x)), y: Math.min(...laid.map(({ y }) => y)) };
  const offset = placement(document, pack);
  return {
    ...proposal,
    commands: proposal.commands.map((command) => {
      if (command.type !== "addNode" || command.id === undefined) return command;
      const point = at[command.id] ?? corner;
      return { ...command, position: { x: point.x - corner.x + offset.x, y: point.y - corner.y + offset.y } };
    }),
  };
}

/** The proposal's commands with its nodes moved by `offset`, where its ghost was left. */
export function placeProposal({ commands }: Pick<Proposal, "commands">, offset: Point): Command[] {
  return commands.map((command) =>
    command.type === "addNode"
      ? {
          ...command,
          position: { ...command.position, x: command.position.x + offset.x, y: command.position.y + offset.y },
        }
      : command,
  );
}

/**
 * The smallest belt or pipe of the item's form that carries a flow on its own; none when no single one does
 * (the flow stays as wide as it needs to be).
 */
function logisticsByItem(pack: PackData): (item: Id, perSecond: number) => Id | undefined {
  const forms = new Map(pack.items.map((item) => [item.id, item.form]));
  const carriers = pack.logistics
    .map((logistics) => ({ ...logistics, perSecond: toPerSecond(logistics.capacity, pack.units.rate) }))
    .sort((a, b) => a.perSecond - b.perSecond);
  return (item, perSecond) =>
    carriers.find((carrier) => carrier.carries === forms.get(item) && carrier.perSecond >= perSecond * (1 - 1e-9))?.id;
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
    addTo(buildings, buildingId, Math.ceil(machines));
    // The plugin's power metric (Satisfactory's `power`, in MW) where it derives one.
    const derived = entry.result.derived?.power ?? entry.result.derived?.powerMW;
    powerMW += derived ?? (buildingsById.get(buildingId)?.power?.consume ?? 0) * machines;
  }
  const shortfalls: Record<Id, number> = {};
  for (const diagnostic of results.diagnostics) {
    if (diagnostic.kind === "deficit") addTo(shortfalls, diagnostic.item, diagnostic.perSecond);
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
function placement(document: Document, pack: PackData): Point {
  const layout = document.layout.root ?? {};
  const rects = Object.entries(document.graph.nodes).flatMap(([id, node]) => {
    const position = layout[id];
    return position ? [{ ...position, ...shapeOf(node, pack, position) }] : [];
  });
  if (rects.length === 0) return { x: 0, y: 0 };
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const top = Math.min(...rects.map((rect) => rect.y));
  return { x: Math.ceil((right + PLACEMENT_GAP) / GRID) * GRID, y: Math.round(top / GRID) * GRID };
}

// About how the canvas draws a node (src/client/canvas/model/geometry.ts and scene.ts), which the engines can't
// import: close is enough for the layout to leave room between cards and line ports up.
const RECIPE_WIDTH = 312;
const TERMINAL = { width: 264, height: 72 };
const JUNCTION = 48;
const PORT_ROW = 28;
/** The header and machine strip above a recipe's first port row, and the padding around the rows. */
const ROWS_TOP = 64 + 24 + 6;
const rowCentre = (row: number) => ROWS_TOP + row * PORT_ROW + PORT_ROW / 2;

function shapeOf(node: Node, pack: PackData, position?: Position): NodeShape {
  switch (node.kind) {
    case "recipe": {
      const recipe = pack.recipes.find((candidate) => candidate.id === node.recipe);
      const inputs = Object.keys(recipe?.in ?? {});
      const outputs = Object.keys(recipe?.out ?? {});
      const ports: PortShape[] = [
        ...inputs.map((item, row): PortShape => ({ side: "in", item, x: 0, y: rowCentre(row) })),
        ...outputs.map((item, row): PortShape => ({
          side: "out",
          item,
          x: RECIPE_WIDTH,
          y: rowCentre(inputs.length + row),
        })),
      ];
      const rows = Math.max(inputs.length + outputs.length, 1);
      return { width: RECIPE_WIDTH, height: ROWS_TOP + 6 + rows * PORT_ROW, ports };
    }
    case "source":
      return { ...TERMINAL, ports: [{ side: "out", item: node.item, x: TERMINAL.width, y: TERMINAL.height / 2 }] };
    case "sink":
      return { ...TERMINAL, ports: [{ side: "in", item: node.item, x: 0, y: TERMINAL.height / 2 }] };
    case "junction":
      return { width: JUNCTION, height: JUNCTION, ports: [] };
    case "note":
      return { width: position?.width ?? 240, height: position?.height ?? 120, ports: [] };
    case "frame":
      return { width: position?.width ?? 480, height: position?.height ?? 312, ports: [] };
    default:
      return { ...TERMINAL, ports: [] };
  }
}
