import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { Model } from "../../contracts/solver";
import { loadSolver, solverIrVersion, validateModel } from "./index";

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
      pin: 4,
      cost: 0,
    },
    { kind: "process", rates: [{ item: 1, perSecond: -1 }], cost: 0 },
  ],
  edges: [
    { from: 0, to: 1, item: 0, capacity: 1 },
    { from: 1, to: 2, item: 1 },
  ],
  constraints: [],
};

beforeAll(async () => {
  await loadSolver(readFileSync(new URL("./wasm/solver_bg.wasm", import.meta.url)));
});

describe("the solver's WebAssembly boundary", () => {
  it("speaks IR version 1", async () => {
    expect(await solverIrVersion()).toBe(1);
  });

  it("accepts a model built from the TS types", async () => {
    await expect(validateModel(chain)).resolves.toBeUndefined();
  });

  it("reports inconsistent models", async () => {
    const broken: Model = { ...chain, edges: [{ from: 0, to: 7, item: 0 }] };
    await expect(validateModel(broken)).rejects.toThrow("edges[0].to: no node 7");
  });
});
