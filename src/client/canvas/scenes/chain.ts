// The canonical 20-node chain (docs/Design.md, Visual QA): motors from ore on the template pack, with the
// washer's water loop, two byproducts, junctions, a note and two frames. Machine counts are those that make
// 0.25 motors per second (15 per minute); every edge carries what its consumer needs.
// Ports sit at fixed offsets (model/geometry.ts), so the positions below line ports up into straight runs.
import type { SceneSpec } from "./build";

const BELT = "conveyor-1";
const PIPE = "pipe";

export const chain: SceneSpec = {
  name: "chain",
  rateUnit: "per_minute",
  nodes: {
    "water-frame": {
      node: { kind: "frame", label: "Water loop", tone: "water" },
      x: 384,
      y: 240,
      width: 1296,
      height: 264,
    },
    "copper-frame": {
      node: { kind: "frame", label: "Copper", tone: "copper" },
      x: -24,
      y: 528,
      width: 1272,
      height: 360,
    },

    "ferrite-ore": { node: { kind: "source", item: "ferrite-ore", maxPerSecond: 8 }, x: 0, y: 72 },
    water: { node: { kind: "source", item: "water" }, x: 0, y: 312 },
    "cuprite-ore": { node: { kind: "source", item: "cuprite-ore", maxPerSecond: 5 }, x: 0, y: 600 },

    "water-merge": { node: { kind: "junction" }, x: 312, y: 136 },
    wash: { node: { kind: "recipe", recipe: "wash-ferrite" }, x: 408, y: 0, machines: 1.25 },
    purify: { node: { kind: "recipe", recipe: "purify-water" }, x: 768, y: 264, machines: 0.625 },
    sludge: { node: { kind: "sink", item: "sludge" }, x: 1392, y: 392 },
    note: {
      node: { kind: "note", text: "The purifier returns three quarters of the washer's water." },
      x: 408,
      y: 288,
      width: 264,
      height: 96,
    },

    "smelt-iron": { node: { kind: "recipe", recipe: "iron-plate" }, x: 768, y: 56, machines: 3.75 },
    "plate-split": { node: { kind: "junction" }, x: 1176, y: 140 },
    gears: { node: { kind: "recipe", recipe: "iron-gear" }, x: 1320, y: 56, machines: 0.5 },

    "smelt-copper": { node: { kind: "recipe", recipe: "copper-plate" }, x: 408, y: 528, machines: 2.625 },
    slag: { node: { kind: "sink", item: "slag" }, x: 768, y: 760 },
    wire: { node: { kind: "recipe", recipe: "copper-wire" }, x: 768, y: 556, machines: 0.4375 },
    "wire-split": { node: { kind: "junction" }, x: 1176, y: 668 },

    circuits: { node: { kind: "recipe", recipe: "circuit" }, x: 1320, y: 556, machines: 1.25 },
    motors: { node: { kind: "recipe", recipe: "motor" }, x: 1728, y: 300, machines: 2.5 },
    goal: { node: { kind: "sink", item: "motor", targetPerSecond: 0.25 }, x: 2136, y: 456 },
  },
  edges: {
    "ore-wash": { from: "ferrite-ore", to: "wash", item: "ferrite-ore", logistics: BELT, perSecond: 1.25 },
    "water-merge-in": { from: "water", to: "water-merge", item: "water", logistics: PIPE, perSecond: 0.15625 },
    "loop-back": { from: "purify", to: "water-merge", item: "water", logistics: PIPE, perSecond: 0.46875 },
    "water-wash": { from: "water-merge", to: "wash", item: "water", logistics: PIPE, perSecond: 0.625 },
    "dirty-water": { from: "wash", to: "purify", item: "dirty-water", logistics: PIPE, perSecond: 0.625 },
    "sludge-out": { from: "purify", to: "sludge", item: "sludge", logistics: BELT, perSecond: 0.15625 },
    "clean-ferrite": { from: "wash", to: "smelt-iron", item: "clean-ferrite", logistics: BELT, perSecond: 1.25 },
    plates: { from: "smelt-iron", to: "plate-split", item: "iron-plate", logistics: BELT, perSecond: 1.25 },
    "plates-gears": { from: "plate-split", to: "gears", item: "iron-plate", logistics: BELT, perSecond: 1 },
    "plates-circuits": { from: "plate-split", to: "circuits", item: "iron-plate", logistics: BELT, perSecond: 0.25 },
    "ore-copper": { from: "cuprite-ore", to: "smelt-copper", item: "cuprite-ore", logistics: BELT, perSecond: 1.75 },
    "slag-out": { from: "smelt-copper", to: "slag", item: "slag", logistics: BELT, perSecond: 0.875 },
    "copper-wire": { from: "smelt-copper", to: "wire", item: "copper-plate", logistics: BELT, perSecond: 0.875 },
    wires: { from: "wire", to: "wire-split", item: "copper-wire", logistics: BELT, perSecond: 1.75 },
    "wire-circuits": { from: "wire-split", to: "circuits", item: "copper-wire", logistics: BELT, perSecond: 0.75 },
    "wire-motors": { from: "wire-split", to: "motors", item: "copper-wire", logistics: BELT, perSecond: 1 },
    "gears-motors": { from: "gears", to: "motors", item: "iron-gear", logistics: BELT, perSecond: 0.5 },
    "circuits-motors": { from: "circuits", to: "motors", item: "circuit", logistics: BELT, perSecond: 0.25 },
    "motors-goal": { from: "motors", to: "goal", item: "motor", logistics: BELT, perSecond: 0.25 },
  },
};
