// Generates benchmark factories from the template pack: production lines of motor cells along shared
// ore and water buses. Every cell has the template's water loop and a slag byproduct, so the LP sees
// cycles and surplus like a real plan. Deterministic: the same size gives the same document.
import type { Document, Edge, Node } from "../src/contracts/document";

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
