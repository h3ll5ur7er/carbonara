// The canonical congested graph (docs/Design.md, Visual QA): two washing and smelting lines feeding one
// gear line on basic conveyors (15/s). The second line runs at 14/s (near capacity), the merged plates at
// 22/s overload their belt, and the gear goal ends up 4/s short.
import type { SceneSpec } from "./build";

const BELT = "conveyor-1";
const FAST_BELT = "conveyor-2";
const PIPE = "pipe";

export const congested: SceneSpec = {
  name: "congested",
  rateUnit: "per_second",
  nodes: {
    ore: { node: { kind: "source", item: "ferrite-ore", maxPerSecond: 24 }, x: 0, y: 240 },
    water: { node: { kind: "source", item: "water" }, x: 0, y: 600 },
    "ore-split": { node: { kind: "junction" }, x: 360, y: 252 },

    "wash-a": { node: { kind: "recipe", recipe: "wash-ferrite" }, x: 504, y: 0, machines: 8 },
    "wash-b": { node: { kind: "recipe", recipe: "wash-ferrite" }, x: 504, y: 336, machines: 14 },
    "smelt-a": { node: { kind: "recipe", recipe: "iron-plate" }, x: 912, y: 56, machines: 24 },
    "smelt-b": { node: { kind: "recipe", recipe: "iron-plate" }, x: 912, y: 392, machines: 42 },

    "dirty-merge": { node: { kind: "junction" }, x: 912, y: 612 },
    "dirty-out": { node: { kind: "sink", item: "dirty-water" }, x: 1056, y: 600 },

    "plate-merge": { node: { kind: "junction" }, x: 1320, y: 336 },
    gears: { node: { kind: "recipe", recipe: "iron-gear" }, x: 1464, y: 252, machines: 11 },
    goal: { node: { kind: "sink", item: "iron-gear", targetPerSecond: 15 }, x: 1872, y: 352 },
  },
  edges: {
    "ore-main": { from: "ore", to: "ore-split", item: "ferrite-ore", logistics: FAST_BELT, perSecond: 22 },
    "ore-a": { from: "ore-split", to: "wash-a", item: "ferrite-ore", logistics: BELT, perSecond: 8 },
    "ore-b": { from: "ore-split", to: "wash-b", item: "ferrite-ore", logistics: BELT, perSecond: 14 },
    "water-a": { from: "water", to: "wash-a", item: "water", logistics: PIPE, perSecond: 4 },
    "water-b": { from: "water", to: "wash-b", item: "water", logistics: PIPE, perSecond: 7 },
    "clean-a": { from: "wash-a", to: "smelt-a", item: "clean-ferrite", logistics: BELT, perSecond: 8 },
    "clean-b": { from: "wash-b", to: "smelt-b", item: "clean-ferrite", logistics: BELT, perSecond: 14 },
    "dirty-a": { from: "wash-a", to: "dirty-merge", item: "dirty-water", logistics: PIPE, perSecond: 4 },
    "dirty-b": { from: "wash-b", to: "dirty-merge", item: "dirty-water", logistics: PIPE, perSecond: 7 },
    "dirty-all": { from: "dirty-merge", to: "dirty-out", item: "dirty-water", logistics: PIPE, perSecond: 11 },
    "plates-a": { from: "smelt-a", to: "plate-merge", item: "iron-plate", logistics: BELT, perSecond: 8 },
    "plates-b": { from: "smelt-b", to: "plate-merge", item: "iron-plate", logistics: BELT, perSecond: 14 },
    "plates-all": { from: "plate-merge", to: "gears", item: "iron-plate", logistics: BELT, perSecond: 22 },
    "gears-out": { from: "gears", to: "goal", item: "iron-gear", logistics: BELT, perSecond: 11 },
  },
  diagnostics: [
    { kind: "overflow", edge: "plates-all", perSecond: 7 },
    { kind: "deficit", node: "goal", item: "iron-gear", perSecond: 4 },
  ],
};
