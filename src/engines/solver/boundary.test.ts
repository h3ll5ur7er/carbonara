import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { Model } from "../../contracts/solver";
import { createSolver, loadSolver, solve, solverIrVersion, validateModel } from "./index";

/** ore source → smelter → ingot sink, built the way the compiler engine will build it. */
const chain: Model = {
  items: 2,
  nodes: [
    { kind: "process", rates: [{ item: 0, perSecond: 1 }], max: 2, cost: 1 },
    {
      kind: "process",
      rates: [
        { item: 0, perSecond: -0.5 },
        { item: 1, perSecond: 0.5 },
      ],
      cost: 0,
    },
    { kind: "process", rates: [{ item: 1, perSecond: -1 }], pin: 1, cost: 0 },
  ],
  edges: [
    { from: 0, to: 1, item: 0, capacity: 1 },
    { from: 1, to: 2, item: 1 },
  ],
  constraints: [],
};

const withPin = (pin: number): Model => ({
  ...chain,
  nodes: chain.nodes.map((node, index) => (index === 2 ? { ...node, pin } : node)),
});

beforeAll(async () => {
  await loadSolver(readFileSync(new URL("./wasm/solver_bg.wasm", import.meta.url)));
});

describe("the solver's WebAssembly boundary", () => {
  it("speaks IR version 2", async () => {
    expect(await solverIrVersion()).toBe(2);
  });

  it("accepts a model built from the TS types", async () => {
    await expect(validateModel(chain)).resolves.toBeUndefined();
  });

  it("reports inconsistent models", async () => {
    const broken: Model = { ...chain, edges: [{ from: 0, to: 7, item: 0 }] };
    await expect(validateModel(broken)).rejects.toThrow("edges[0].to: no node 7");
  });

  it("solves a model built from the TS types", async () => {
    const result = await solve(chain);
    expect(result).toEqual({
      ok: true,
      value: {
        activity: [1, 2, 1],
        flow: [1, 1],
        surplus: [],
        deficit: [],
        overflow: [],
        pinMisses: [],
      },
    });
  });

  it("reports slacks with the IR's field names", async () => {
    // The sink wants 3/s, but the smelter makes at most 2/s, from 2 ore/s on a belt for 1/s.
    const pinned = withPin(3);
    const model = { ...pinned, nodes: pinned.nodes.map((node, i) => (i === 1 ? { ...node, max: 4 } : node)) };
    const result = await solve(model);
    if (!result.ok) throw new Error("expected a solution");
    // Non-zero slacks are exact to about 1e-8 (docs/Architecture/Solver.md, LP formulation).
    expect(result.value.overflow).toEqual([{ edge: 0, perSecond: expect.closeTo(1, 7) }]);
    expect(result.value.deficit).toEqual([{ node: 2, item: 1, perSecond: expect.closeTo(1, 7) }]);
  });

  it("returns unsolvable models as values", async () => {
    const contradiction: Model = {
      ...chain,
      constraints: [{ terms: [{ node: 0, coefficient: 1 }], op: "atLeast", rhs: 5 }],
    };
    await expect(solve(contradiction)).resolves.toEqual({ ok: false, error: "infeasible" });
  });

  it("throws on inconsistent models, which are compiler bugs", async () => {
    await expect(solve({ ...chain, items: 1 })).rejects.toThrow("no item 1");
  });

  it("re-solves only what changed with an incremental solver", async () => {
    const solver = await createSolver();
    try {
      const twoChains: Model = {
        ...chain,
        nodes: [...chain.nodes, ...chain.nodes],
        edges: [...chain.edges, ...chain.edges.map((edge) => ({ ...edge, from: edge.from + 3, to: edge.to + 3 }))],
      };
      solver.solve(twoChains);
      const edited = {
        ...twoChains,
        nodes: twoChains.nodes.map((node, i) => (i === 5 ? { ...node, pin: 0.5 } : node)),
      };
      const result = solver.solve(edited);
      expect(solver.lastSolved()).toBe(1);
      expect(result).toEqual(await solve(edited));
    } finally {
      solver.dispose();
    }
  });

  it("solves instances of blueprints", async () => {
    // The chain's smelter as a blueprint (ore port → smelter pinned to 2 machines → ingot port), placed once.
    const placed: Model = {
      items: 2,
      nodes: [
        { kind: "process", rates: [{ item: 0, perSecond: 1 }], cost: 1 },
        { kind: "instance", rates: [], cost: 0, blueprint: 0 },
        { kind: "process", rates: [{ item: 1, perSecond: -1 }], pin: 3, cost: 0 },
      ],
      edges: [
        { from: 0, to: 1, item: 0, toPort: 0 },
        { from: 1, to: 2, item: 1, fromPort: 1 },
      ],
      constraints: [],
      blueprints: [
        {
          nodes: [
            { kind: "process", rates: [{ item: 0, perSecond: 1 }], cost: 0 },
            { kind: "process", rates: chain.nodes[1]?.rates ?? [], pin: 2, cost: 0 },
            { kind: "process", rates: [{ item: 1, perSecond: -1 }], cost: 0 },
          ],
          edges: [
            { from: 0, to: 1, item: 0 },
            { from: 1, to: 2, item: 1 },
          ],
          constraints: [],
          ports: [0, 2],
        },
      ],
    };
    const rounded = (values: number[] | undefined) => values?.map((value) => Number(value.toFixed(9)));
    const solver = await createSolver();
    try {
      const around = solver.solve(placed);
      if (!around.ok) throw new Error("expected a solution");
      // Designed for 2 smelters (1 ingot/s), the instance runs 3 times.
      expect(around.value.activity[1]).toBeCloseTo(3, 9);
      expect(rounded(around.value.instances?.[0]?.ports)).toEqual([3, 3]);
      expect(solver.lastSummarised()).toBe(1);
    } finally {
      solver.dispose();
    }
  });
});
