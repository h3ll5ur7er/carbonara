// The canonical "inside a subgraph" scene (docs/Design.md, Visual QA): a copper wire line collapsed into a
// blueprint and placed twice in a small factory, seen from inside. Its rates are those of both instances together,
// twice the chain scene's copper line (0.25 motors per second each); ports line up with the rows they feed.
import type { Document } from "../../../contracts/document";
import type { PackData } from "../../../contracts/pack";
import type { AnalysisResults } from "../../../contracts/results";
import { buildScene, type SceneSpec } from "./build";

const BELT = "conveyor-1";
export const SUBGRAPH_BLUEPRINT = "copper-wire";

/** The blueprint's inside, as a root graph (it's moved into the blueprint below). */
const inside: SceneSpec = {
  name: "subgraph",
  rateUnit: "per_minute",
  nodes: {
    "in-cuprite-ore": { node: { kind: "port", direction: "in", item: "cuprite-ore" }, x: 0, y: 72 },
    "smelt-copper": { node: { kind: "recipe", recipe: "copper-plate" }, x: 384, y: 0, machines: 5.25 },
    wire: { node: { kind: "recipe", recipe: "copper-wire" }, x: 792, y: 28, machines: 0.875 },
    "out-copper-wire": { node: { kind: "port", direction: "out", item: "copper-wire" }, x: 1200, y: 128 },
    "out-slag": { node: { kind: "port", direction: "out", item: "slag" }, x: 792, y: 288 },
    note: {
      node: { kind: "note", text: "Rates here add up both copper lines of the factory." },
      x: 384,
      y: 264,
      width: 312,
      height: 96,
    },
  },
  edges: {
    ore: { from: "in-cuprite-ore", to: "smelt-copper", item: "cuprite-ore", logistics: BELT, perSecond: 3.5 },
    plates: { from: "smelt-copper", to: "wire", item: "copper-plate", logistics: BELT, perSecond: 1.75 },
    wires: { from: "wire", to: "out-copper-wire", item: "copper-wire", logistics: BELT, perSecond: 3.5 },
    slag: { from: "smelt-copper", to: "out-slag", item: "slag", logistics: BELT, perSecond: 1.75 },
  },
};

/** The factory around it: ore split between two copper lines, whose wire and slag leave the factory. */
const around: SceneSpec = {
  name: "subgraph",
  rateUnit: "per_minute",
  nodes: {
    "cuprite-ore": { node: { kind: "source", item: "cuprite-ore", maxPerSecond: 5 }, x: 0, y: 160 },
    "ore-split": { node: { kind: "junction" }, x: 360, y: 172 },
    "line-a": { node: { kind: "instance", blueprint: SUBGRAPH_BLUEPRINT }, x: 528, y: 0 },
    "line-b": { node: { kind: "instance", blueprint: SUBGRAPH_BLUEPRINT }, x: 528, y: 240 },
    wire: { node: { kind: "sink", item: "copper-wire" }, x: 1032, y: 48 },
    slag: { node: { kind: "sink", item: "slag" }, x: 1032, y: 336 },
  },
  edges: {
    "ore-split": { from: "cuprite-ore", to: "ore-split", item: "cuprite-ore", logistics: BELT, perSecond: 3.5 },
    "ore-a": { from: "ore-split", to: "line-a", toPort: "in-cuprite-ore", item: "cuprite-ore", perSecond: 1.75 },
    "ore-b": { from: "ore-split", to: "line-b", toPort: "in-cuprite-ore", item: "cuprite-ore", perSecond: 1.75 },
    "wire-a": { from: "line-a", fromPort: "out-copper-wire", to: "wire", item: "copper-wire", perSecond: 1.75 },
    "wire-b": { from: "line-b", fromPort: "out-copper-wire", to: "wire", item: "copper-wire", perSecond: 1.75 },
    "slag-a": { from: "line-a", fromPort: "out-slag", to: "slag", item: "slag", perSecond: 0.875 },
    "slag-b": { from: "line-b", fromPort: "out-slag", to: "slag", item: "slag", perSecond: 0.875 },
  },
};

/** The document (the factory with the blueprint), the root's results and the blueprint's (both instances). */
export function subgraphScene(pack: PackData): { document: Document; root: AnalysisResults; inside: AnalysisResults } {
  const body = buildScene(pack, inside);
  const factory = buildScene(pack, around);
  const document: Document = {
    ...factory.document,
    name: "Wire works",
    blueprints: { [SUBGRAPH_BLUEPRINT]: { name: "Copper Wire line", graph: body.document.graph } },
    layout: { ...factory.document.layout, [SUBGRAPH_BLUEPRINT]: body.document.layout["root"] ?? {} },
  };
  const instance = (share: number) => ({
    activity: 0,
    inputs: { "cuprite-ore": 3.5 * share },
    outputs: { "copper-wire": 3.5 * share, slag: 1.75 * share },
  });
  return {
    document,
    root: { ...factory.results, nodes: { ...factory.results.nodes, "line-a": instance(0.5), "line-b": instance(0.5) } },
    inside: { ...body.results, graph: SUBGRAPH_BLUEPRINT },
  };
}
