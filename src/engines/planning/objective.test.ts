import { describe, expect, it } from "vitest";
import type { Model } from "../../contracts/solver";
import { TIE_BREAK, weigh } from "./objective";

/** As the compiler builds it: a raw source (cost 1), a recipe, a hub, a target sink, and a one-output recipe. */
const model: Model = {
  items: 3,
  nodes: [
    { kind: "process", rates: [{ item: 0, perSecond: 1 }], max: 500, cost: 1 },
    {
      kind: "process",
      rates: [
        { item: 0, perSecond: -1 },
        { item: 1, perSecond: 1 },
      ],
      cost: 0,
    },
    { kind: "junction", rates: [], cost: 0 },
    { kind: "process", rates: [{ item: 1, perSecond: -1 }], pin: 1, cost: 0 },
    { kind: "process", rates: [{ item: 2, perSecond: 2 }], cost: 0 },
  ],
  edges: [],
  constraints: [],
};
const costs = (weighed: Model) => weighed.nodes.map((node) => node.cost);

describe("the planning objective", () => {
  it("minimises raw resources first, then machines", () => {
    expect(costs(weigh(model, "resources"))).toEqual([1, TIE_BREAK, 0, 0, TIE_BREAK]);
  });

  it("minimises machines first, then raw resources", () => {
    expect(costs(weigh(model, "buildings"))).toEqual([TIE_BREAK, 1, 0, 0, 1]);
  });

  it("changes nothing but the costs", () => {
    const weighed = weigh(model, "buildings");
    expect(weighed.nodes.map(({ cost: _cost, ...node }) => node)).toEqual(
      model.nodes.map(({ cost: _cost, ...node }) => node),
    );
    expect(model.nodes[0]?.cost).toBe(1);
  });
});
