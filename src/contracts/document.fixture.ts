// A document that uses every node kind; shared by tests across layers.
export const exampleDocument = {
  format: "carbonara",
  version: 1,
  id: "doc-1",
  name: "Iron",
  pack: { id: "satisfactory", version: "1.2.0", hash: "sha256-abc" },
  graph: {
    nodes: {
      ore: { kind: "source", item: "iron-ore", maxPerSecond: 2 },
      smelt: { kind: "recipe", recipe: "iron-ingot", fields: { clock: 150 }, pin: { type: "machines", count: 4 } },
      split: { kind: "junction" },
      out: { kind: "sink", item: "iron-ingot", targetPerSecond: 1 },
      rods: { kind: "instance", blueprint: "rods" },
      hint: { kind: "note", text: "Upgrade belts later" },
      area: { kind: "frame", label: "Smelting", tone: "orange" },
    },
    edges: {
      e1: { from: "ore", to: "smelt", item: "iron-ore", logistics: "belt-mk1" },
      e2: { from: "smelt", to: "split", item: "iron-ingot" },
      e3: { from: "split", to: "out", item: "iron-ingot", ratio: 0.5 },
      e4: { from: "split", to: "rods", toPort: "in", item: "iron-ingot" },
    },
  },
  blueprints: {
    rods: {
      name: "Iron rods",
      graph: {
        nodes: {
          in: { kind: "port", direction: "in", item: "iron-ingot" },
          make: { kind: "recipe", recipe: "iron-rod" },
          out: { kind: "port", direction: "out", item: "iron-rod" },
        },
        edges: {
          a: { from: "in", to: "make", item: "iron-ingot" },
          b: { from: "make", to: "out", item: "iron-rod" },
        },
      },
    },
  },
  layout: {
    root: { ore: { x: 0, y: 0 }, smelt: { x: 240, y: 0 }, area: { x: -20, y: -20, width: 600, height: 300 } },
    rods: { in: { x: 0, y: 0 } },
  },
  settings: { rateUnit: "per_minute" },
};
