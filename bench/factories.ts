// Generates benchmark factories from the template pack: production lines of motor cells along shared
// ore and water buses. Every cell has the template's water loop and a slag byproduct, so the LP sees
// cycles and surplus like a real plan. Deterministic: the same size gives the same document.
import type { Blueprint, Document, Edge, Graph, Node } from "../src/contracts/document";

/** Nodes in one cell; a line adds its three sources and one sink. */
export const NODES_PER_CELL = 15;

export interface FactoryShape {
  /** Production lines; each is one weakly connected component. */
  lines: number;
  cellsPerLine: number;
}

/** A line of about `nodes` nodes (one component). */
export function cellsFor(nodes: number): number {
  return Math.max(1, Math.round((nodes - 4) / NODES_PER_CELL));
}

/** Machines of the motor assembler in a cell: varied so cells differ, the same for the same cell. */
export function motorMachines(line: number, cell: number): number {
  return 1 + ((line + cell) % 4) * 0.25;
}

export function generateFactory({ lines, cellsPerLine }: FactoryShape): Document {
  const nodes: Record<string, Node> = {};
  const edges: Record<string, Edge> = {};
  const link = (from: string, to: string, item: string, logistics?: string) => {
    edges[`${from}>${to}`] = { from, to, item, ...(logistics !== undefined && { logistics }) };
  };

  for (let line = 0; line < lines; line++) {
    const id = (name: string) => `l${line}-${name}`;
    nodes[id("ferrite")] = { kind: "source", item: "ferrite-ore" };
    nodes[id("cuprite")] = { kind: "source", item: "cuprite-ore" };
    nodes[id("water")] = { kind: "source", item: "water" };
    nodes[id("motors")] = { kind: "sink", item: "motor" };

    for (let cell = 0; cell < cellsPerLine; cell++) {
      const at = (name: string) => id(`c${cell}-${name}`);
      const previous = (name: string) => id(`c${cell - 1}-${name}`);
      for (const bus of ["fe-bus", "cu-bus", "water-bus", "motor-bus", "water-mix", "iron-split", "wire-split"]) {
        nodes[at(bus)] = { kind: "junction" };
      }
      nodes[at("wash")] = { kind: "recipe", recipe: "wash-ferrite" };
      nodes[at("purify")] = { kind: "recipe", recipe: "purify-water" };
      nodes[at("smelt")] = { kind: "recipe", recipe: "iron-plate" };
      nodes[at("copper")] = { kind: "recipe", recipe: "copper-plate" };
      nodes[at("wire")] = { kind: "recipe", recipe: "copper-wire" };
      nodes[at("gear")] = { kind: "recipe", recipe: "iron-gear" };
      nodes[at("circuit")] = { kind: "recipe", recipe: "circuit" };
      nodes[at("motor")] = {
        kind: "recipe",
        recipe: "motor",
        pin: { type: "machines", count: motorMachines(line, cell) },
      };

      // The buses run along the line; the motors run to the sink at its end.
      link(cell === 0 ? id("ferrite") : previous("fe-bus"), at("fe-bus"), "ferrite-ore");
      link(cell === 0 ? id("cuprite") : previous("cu-bus"), at("cu-bus"), "cuprite-ore");
      link(cell === 0 ? id("water") : previous("water-bus"), at("water-bus"), "water");
      if (cell > 0) link(previous("motor-bus"), at("motor-bus"), "motor");

      link(at("fe-bus"), at("wash"), "ferrite-ore", "conveyor-1");
      link(at("water-bus"), at("water-mix"), "water", "pipe");
      link(at("purify"), at("water-mix"), "water", "pipe");
      link(at("water-mix"), at("wash"), "water", "pipe");
      link(at("wash"), at("purify"), "dirty-water", "pipe");
      link(at("wash"), at("smelt"), "clean-ferrite", "conveyor-1");
      link(at("smelt"), at("iron-split"), "iron-plate", "conveyor-1");
      link(at("iron-split"), at("gear"), "iron-plate", "conveyor-1");
      link(at("iron-split"), at("circuit"), "iron-plate", "conveyor-1");
      link(at("cu-bus"), at("copper"), "cuprite-ore", "conveyor-1");
      link(at("copper"), at("wire"), "copper-plate", "conveyor-1");
      link(at("wire"), at("wire-split"), "copper-wire", "conveyor-1");
      link(at("wire-split"), at("circuit"), "copper-wire", "conveyor-1");
      link(at("wire-split"), at("motor"), "copper-wire", "conveyor-1");
      link(at("gear"), at("motor"), "iron-gear", "conveyor-1");
      link(at("circuit"), at("motor"), "circuit", "conveyor-1");
      link(at("motor"), at("motor-bus"), "motor", "conveyor-1");
    }
    link(id(`c${cellsPerLine - 1}-motor-bus`), id("motors"), "motor");
  }

  return {
    format: "carbonara",
    version: 1,
    id: `bench-${lines}x${cellsPerLine}`,
    name: `Benchmark ${lines} × ${cellsPerLine} cells`,
    pack: { id: "template", version: "1.0.0", hash: "sha256-template" },
    graph: { nodes, edges },
    blueprints: {},
    layout: {},
    settings: {},
  };
}

/** Motors per second of one motor assembler (the template's motor recipe: 1 motor in 10 s). */
const MOTORS_PER_MACHINE = 0.1;

/**
 * The same production lines built from subgraphs: one blueprint holds a motor cell (designed for one motor
 * assembler) and each line places it once per cell, along its ore, cuprite and water buses, with a motor
 * sink per cell. Nodes count the blueprint's nodes once per instance.
 */
export function generateSubgraphFactory({ lines, cellsPerLine }: FactoryShape): Document {
  const cell: Graph = { nodes: {}, edges: {} };
  const link = (graph: Graph, from: string, to: string, item: string, extra: Partial<Edge> = {}) => {
    graph.edges[`${from}>${to}`] = { from, to, item, ...extra };
  };
  cell.nodes.ore = { kind: "port", direction: "in", item: "ferrite-ore" };
  cell.nodes.cuprite = { kind: "port", direction: "in", item: "cuprite-ore" };
  cell.nodes.water = { kind: "port", direction: "in", item: "water" };
  cell.nodes.motors = { kind: "port", direction: "out", item: "motor" };
  for (const junction of ["water-mix", "iron-split", "wire-split"]) cell.nodes[junction] = { kind: "junction" };
  cell.nodes.wash = { kind: "recipe", recipe: "wash-ferrite" };
  cell.nodes.purify = { kind: "recipe", recipe: "purify-water" };
  cell.nodes.smelt = { kind: "recipe", recipe: "iron-plate" };
  cell.nodes.copper = { kind: "recipe", recipe: "copper-plate" };
  cell.nodes.wire = { kind: "recipe", recipe: "copper-wire" };
  cell.nodes.gear = { kind: "recipe", recipe: "iron-gear" };
  cell.nodes.circuit = { kind: "recipe", recipe: "circuit" };
  cell.nodes.motor = { kind: "recipe", recipe: "motor", pin: { type: "machines", count: 1 } };
  const belt = { logistics: "conveyor-1" };
  const pipe = { logistics: "pipe" };
  link(cell, "ore", "wash", "ferrite-ore", belt);
  link(cell, "water", "water-mix", "water", pipe);
  link(cell, "purify", "water-mix", "water", pipe);
  link(cell, "water-mix", "wash", "water", pipe);
  link(cell, "wash", "purify", "dirty-water", pipe);
  link(cell, "wash", "smelt", "clean-ferrite", belt);
  link(cell, "smelt", "iron-split", "iron-plate", belt);
  link(cell, "iron-split", "gear", "iron-plate", belt);
  link(cell, "iron-split", "circuit", "iron-plate", belt);
  link(cell, "cuprite", "copper", "cuprite-ore", belt);
  link(cell, "copper", "wire", "copper-plate", belt);
  link(cell, "wire", "wire-split", "copper-wire", belt);
  link(cell, "wire-split", "circuit", "copper-wire", belt);
  link(cell, "wire-split", "motor", "copper-wire", belt);
  link(cell, "gear", "motor", "iron-gear", belt);
  link(cell, "circuit", "motor", "circuit", belt);
  link(cell, "motor", "motors", "motor", belt);

  const root: Graph = { nodes: {}, edges: {} };
  for (let line = 0; line < lines; line++) {
    const id = (name: string) => `l${line}-${name}`;
    root.nodes[id("ferrite")] = { kind: "source", item: "ferrite-ore" };
    root.nodes[id("cuprite")] = { kind: "source", item: "cuprite-ore" };
    root.nodes[id("water")] = { kind: "source", item: "water" };
    for (let index = 0; index < cellsPerLine; index++) {
      const at = (name: string) => id(`c${index}-${name}`);
      const previous = (name: string) => id(`c${index - 1}-${name}`);
      for (const bus of ["fe-bus", "cu-bus", "water-bus"]) root.nodes[at(bus)] = { kind: "junction" };
      root.nodes[at("cell")] = { kind: "instance", blueprint: "motor-cell" };
      root.nodes[at("motors")] = { kind: "sink", item: "motor", targetPerSecond: target(line, index) };
      link(root, index === 0 ? id("ferrite") : previous("fe-bus"), at("fe-bus"), "ferrite-ore");
      link(root, index === 0 ? id("cuprite") : previous("cu-bus"), at("cu-bus"), "cuprite-ore");
      link(root, index === 0 ? id("water") : previous("water-bus"), at("water-bus"), "water");
      link(root, at("fe-bus"), at("cell"), "ferrite-ore", { toPort: "ore" });
      link(root, at("cu-bus"), at("cell"), "cuprite-ore", { toPort: "cuprite" });
      link(root, at("water-bus"), at("cell"), "water", { toPort: "water" });
      link(root, at("cell"), at("motors"), "motor", { fromPort: "motors" });
    }
  }

  return {
    format: "carbonara",
    version: 1,
    id: `bench-subgraphs-${lines}x${cellsPerLine}`,
    name: `Benchmark ${lines} × ${cellsPerLine} cells from subgraphs`,
    pack: { id: "template", version: "1.0.0", hash: "sha256-template" },
    graph: root,
    blueprints: { "motor-cell": { name: "Motor cell", graph: cell } },
    layout: {},
    settings: {},
  };
}

/** Motors a cell's sink wants: different on every line, so that no two lines are the same component. */
function target(line: number, cell: number): number {
  return motorMachines(line, cell) * MOTORS_PER_MACHINE * (1 + line / 1000);
}

/** Nodes of a factory with every instance counted as its blueprint's nodes. */
export function expandedNodes(document: Document): number {
  const count = (graph: Graph): number =>
    Object.values(graph.nodes).reduce((sum, node) => {
      const blueprint = node.kind === "instance" ? document.blueprints[node.blueprint] : undefined;
      return sum + (blueprint ? count(blueprint.graph) : 1);
    }, 0);
  return count(document.graph);
}

/** The subgraph factory with one cell's motor target changed. */
export function editTarget(document: Document, line: number, cell: number, edit: number): Document {
  const id = `l${line}-c${cell}-motors`;
  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: {
        ...document.graph.nodes,
        // Never a target the factory had before, so the edit can't hit a cached component.
        [id]: { kind: "sink", item: "motor", targetPerSecond: (2 + edit / 64) * MOTORS_PER_MACHINE },
      },
    },
  };
}

/** The subgraph factory with its blueprint's design changed: every instance's summary changes. */
export function editBlueprint(document: Document, edit: number): Document {
  const cell = document.blueprints["motor-cell"] as Blueprint;
  return {
    ...document,
    blueprints: {
      "motor-cell": {
        ...cell,
        graph: {
          ...cell.graph,
          nodes: {
            ...cell.graph.nodes,
            motor: { kind: "recipe", recipe: "motor", pin: { type: "machines", count: 1 + edit / 64 } },
          },
        },
      },
    },
  };
}

/** The same factory with one motor assembler's pin changed: the edit the benchmark measures. */
export function editMotor(document: Document, line: number, cell: number, edit: number): Document {
  const id = `l${line}-c${cell}-motor`;
  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: {
        ...document.graph.nodes,
        // Never a count the factory had before, so the edit can't hit a cached component.
        [id]: { kind: "recipe", recipe: "motor", pin: { type: "machines", count: 2 + edit / 64 } },
      },
    },
  };
}
