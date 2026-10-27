// The perf scene: 1,000 nodes and 800 flows, 200 copies of a five-node copper line (ore → plate → wire →
// junction → output) in a 10 × 20 grid. Loads vary per line so every flow colour and width appears.
import type { SceneNode, SceneSpec } from "./build";

const LINES_PER_ROW = 10;
const ROWS = 20;
const LINE_WIDTH = 1728;
const ROW_HEIGHT = 240;
/** Copper furnaces per line; 21 runs the ore belt near capacity, 25 over it. */
const FURNACES = [3, 6, 12, 21, 25];

function line(index: number, nodes: Record<string, SceneNode>, edges: SceneSpec["edges"]) {
  const x = (index % LINES_PER_ROW) * LINE_WIDTH;
  const y = Math.floor(index / LINES_PER_ROW) * ROW_HEIGHT;
  const furnaces = FURNACES[index % FURNACES.length] ?? 1;
  const ore = (furnaces * 2) / 3;
  const plates = furnaces / 3;
  const wire = plates * 2;
  const id = (name: string) => `${name}-${index}`;

  nodes[id("ore")] = { node: { kind: "source", item: "cuprite-ore" }, x, y: y + 72 };
  nodes[id("plate")] = { node: { kind: "recipe", recipe: "copper-plate" }, x: x + 360, y, machines: furnaces };
  nodes[id("wire")] = { node: { kind: "recipe", recipe: "copper-wire" }, x: x + 768, y: y + 28, machines: plates / 2 };
  nodes[id("split")] = { node: { kind: "junction" }, x: x + 1176, y: y + 140 };
  nodes[id("out")] = { node: { kind: "sink", item: "copper-wire" }, x: x + 1320, y: y + 128 };

  const belt = "conveyor-1";
  edges[id("e-ore")] = { from: id("ore"), to: id("plate"), item: "cuprite-ore", logistics: belt, perSecond: ore };
  edges[id("e-plate")] = {
    from: id("plate"),
    to: id("wire"),
    item: "copper-plate",
    logistics: belt,
    perSecond: plates,
  };
  edges[id("e-wire")] = { from: id("wire"), to: id("split"), item: "copper-wire", logistics: belt, perSecond: wire };
  edges[id("e-out")] = { from: id("split"), to: id("out"), item: "copper-wire", logistics: belt, perSecond: wire };
}

function build(): SceneSpec {
  const nodes: Record<string, SceneNode> = {};
  const edges: SceneSpec["edges"] = {};
  for (let index = 0; index < LINES_PER_ROW * ROWS; index++) line(index, nodes, edges);
  return { name: "perf", rateUnit: "per_minute", nodes, edges };
}

export const perf: SceneSpec = build();
