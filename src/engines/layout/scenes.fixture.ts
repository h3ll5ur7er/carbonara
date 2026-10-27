// The canonical canvas scenes (src/client/canvas/scenes/chain.ts and congested.ts) as the layout engine sees
// them: their graphs, their hand-made positions and the shapes the canvas draws (model/geometry.ts) on the
// template pack. Test fixture only; engines can't import the client, so the topology is written out again.
import type { Graph, Node, Position } from "../../contracts/document";
import type { NodeShape } from "../../contracts/layout";

export interface LayoutScene {
  graph: Graph;
  positions: Record<string, Position>;
  shapes: Record<string, NodeShape>;
}

const RECIPES: Record<string, [inputs: string[], outputs: string[]]> = {
  "wash-ferrite": [
    ["ferrite-ore", "water"],
    ["clean-ferrite", "dirty-water"],
  ],
  "purify-water": [["dirty-water"], ["water", "sludge"]],
  "iron-plate": [["clean-ferrite"], ["iron-plate"]],
  "copper-plate": [["cuprite-ore"], ["copper-plate", "slag"]],
  "iron-gear": [["iron-plate"], ["iron-gear"]],
  "copper-wire": [["copper-plate"], ["copper-wire"]],
  circuit: [["iron-plate", "copper-wire"], ["circuit"]],
  motor: [["iron-gear", "circuit", "copper-wire"], ["motor"]],
};

/** The canvas's geometry (src/client/canvas/model/geometry.ts). */
export function shapeOf(node: Node, position?: Position): NodeShape {
  switch (node.kind) {
    case "recipe": {
      const [inputs, outputs] = RECIPES[node.recipe] ?? [[], []];
      const row = (index: number) => 108 + 28 * index;
      return {
        width: 312,
        height: 100 + Math.max(inputs.length + outputs.length, 1) * 28,
        ports: [
          ...inputs.map((item, index) => ({ side: "in" as const, item, x: 0, y: row(index) })),
          ...outputs.map((item, index) => ({ side: "out" as const, item, x: 312, y: row(inputs.length + index) })),
        ],
      };
    }
    case "source":
      return { width: 264, height: 72, ports: [{ side: "out", item: node.item, x: 264, y: 36 }] };
    case "sink":
      return { width: 264, height: 72, ports: [{ side: "in", item: node.item, x: 0, y: 36 }] };
    case "junction":
      return {
        width: 48,
        height: 48,
        ports: [
          { side: "in", x: 0, y: 24 },
          { side: "out", x: 48, y: 24 },
        ],
      };
    default:
      return { width: position?.width ?? 240, height: position?.height ?? 120, ports: [] };
  }
}

/**
 * The shapes as the canvas draws nodes whose flows run down (model/scene.ts, `orient`): inputs spread along
 * the top edge, outputs along the bottom.
 */
export function downShapes(shapes: Record<string, NodeShape>): Record<string, NodeShape> {
  return Object.fromEntries(
    Object.entries(shapes).map(([id, shape]) => {
      const along = (side: "in" | "out") => shape.ports.filter((port) => port.side === side);
      const place = (side: "in" | "out") =>
        along(side).map((port, index, all) => ({
          ...port,
          x: (shape.width * (index + 1)) / (all.length + 1),
          y: side === "in" ? 0 : shape.height,
        }));
      return [id, { ...shape, ports: [...place("in"), ...place("out")] }];
    }),
  );
}

type Spec = Record<string, [node: Node, x: number, y: number, size?: { width: number; height: number }]>;
type Edges = Record<string, [from: string, to: string, item: string]>;

function scene(nodes: Spec, edges: Edges): LayoutScene {
  const graph: Graph = { nodes: {}, edges: {} };
  const positions: Record<string, Position> = {};
  const shapes: Record<string, NodeShape> = {};
  for (const [id, [node, x, y, size]] of Object.entries(nodes)) {
    graph.nodes[id] = node;
    positions[id] = { x, y, ...size };
    shapes[id] = shapeOf(node, positions[id]);
  }
  for (const [id, [from, to, item]] of Object.entries(edges)) graph.edges[id] = { from, to, item };
  return { graph, positions, shapes };
}

const recipe = (id: string): Node => ({ kind: "recipe", recipe: id });
const source = (item: string): Node => ({ kind: "source", item });
const sink = (item: string): Node => ({ kind: "sink", item });
const junction: Node = { kind: "junction" };

export const chain = scene(
  {
    "water-frame": [{ kind: "frame", label: "Water loop" }, 384, 240, { width: 1296, height: 264 }],
    "copper-frame": [{ kind: "frame", label: "Copper" }, -24, 528, { width: 1272, height: 360 }],
    "ferrite-ore": [source("ferrite-ore"), 0, 72],
    water: [source("water"), 0, 312],
    "cuprite-ore": [source("cuprite-ore"), 0, 600],
    "water-merge": [junction, 312, 136],
    wash: [recipe("wash-ferrite"), 408, 0],
    purify: [recipe("purify-water"), 768, 264],
    sludge: [sink("sludge"), 1392, 392],
    note: [{ kind: "note", text: "Water" }, 408, 288, { width: 264, height: 96 }],
    "smelt-iron": [recipe("iron-plate"), 768, 56],
    "plate-split": [junction, 1176, 140],
    gears: [recipe("iron-gear"), 1320, 56],
    "smelt-copper": [recipe("copper-plate"), 408, 528],
    slag: [sink("slag"), 768, 760],
    wire: [recipe("copper-wire"), 768, 556],
    "wire-split": [junction, 1176, 668],
    circuits: [recipe("circuit"), 1320, 556],
    motors: [recipe("motor"), 1728, 300],
    goal: [sink("motor"), 2136, 456],
  },
  {
    "ore-wash": ["ferrite-ore", "wash", "ferrite-ore"],
    "water-merge-in": ["water", "water-merge", "water"],
    "loop-back": ["purify", "water-merge", "water"],
    "water-wash": ["water-merge", "wash", "water"],
    "dirty-water": ["wash", "purify", "dirty-water"],
    "sludge-out": ["purify", "sludge", "sludge"],
    "clean-ferrite": ["wash", "smelt-iron", "clean-ferrite"],
    plates: ["smelt-iron", "plate-split", "iron-plate"],
    "plates-gears": ["plate-split", "gears", "iron-plate"],
    "plates-circuits": ["plate-split", "circuits", "iron-plate"],
    "ore-copper": ["cuprite-ore", "smelt-copper", "cuprite-ore"],
    "slag-out": ["smelt-copper", "slag", "slag"],
    "copper-wire": ["smelt-copper", "wire", "copper-plate"],
    wires: ["wire", "wire-split", "copper-wire"],
    "wire-circuits": ["wire-split", "circuits", "copper-wire"],
    "wire-motors": ["wire-split", "motors", "copper-wire"],
    "gears-motors": ["gears", "motors", "iron-gear"],
    "circuits-motors": ["circuits", "motors", "circuit"],
    "motors-goal": ["motors", "goal", "motor"],
  },
);

export const congested = scene(
  {
    ore: [source("ferrite-ore"), 0, 240],
    water: [source("water"), 0, 600],
    "ore-split": [junction, 360, 252],
    "wash-a": [recipe("wash-ferrite"), 504, 0],
    "wash-b": [recipe("wash-ferrite"), 504, 336],
    "smelt-a": [recipe("iron-plate"), 912, 56],
    "smelt-b": [recipe("iron-plate"), 912, 392],
    "dirty-merge": [junction, 912, 612],
    "dirty-out": [sink("dirty-water"), 1056, 600],
    "plate-merge": [junction, 1320, 336],
    gears: [recipe("iron-gear"), 1464, 252],
    goal: [sink("iron-gear"), 1872, 352],
  },
  {
    "ore-main": ["ore", "ore-split", "ferrite-ore"],
    "ore-a": ["ore-split", "wash-a", "ferrite-ore"],
    "ore-b": ["ore-split", "wash-b", "ferrite-ore"],
    "water-a": ["water", "wash-a", "water"],
    "water-b": ["water", "wash-b", "water"],
    "clean-a": ["wash-a", "smelt-a", "clean-ferrite"],
    "clean-b": ["wash-b", "smelt-b", "clean-ferrite"],
    "dirty-a": ["wash-a", "dirty-merge", "dirty-water"],
    "dirty-b": ["wash-b", "dirty-merge", "dirty-water"],
    "dirty-all": ["dirty-merge", "dirty-out", "dirty-water"],
    "plates-a": ["smelt-a", "plate-merge", "iron-plate"],
    "plates-b": ["smelt-b", "plate-merge", "iron-plate"],
    "plates-all": ["plate-merge", "gears", "iron-plate"],
    "gears-out": ["gears", "goal", "iron-gear"],
  },
);
