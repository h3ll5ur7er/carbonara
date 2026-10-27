import { describe, expect, it } from "vitest";
import type { Model } from "../../contracts/solver";
import { TIE_BREAK, weigh } from "./objective";
import type { Role } from "./superstructure";

const roles: Record<string, Role> = {
  "raw:ore": { kind: "raw", item: "ore" },
  "recipe:smelt": { kind: "recipe", recipe: "smelt" },
  "hub:ore": { kind: "hub", item: "ore" },
  "target:plate": { kind: "target", item: "plate" },
};
const ids = Object.keys(roles);
const model: Model = {
  items: 2,
  nodes: [
    { kind: "process", rates: [{ item: 0, perSecond: 1 }], cost: 1 },
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
  ],
  edges: [],
  constraints: [],
};
const costs = (weighed: Model) => weighed.nodes.map((node) => node.cost);

describe("the planning objective", () => {
  it("minimises raw resources first, then machines", () => {
    expect(costs(weigh(model, ids, roles, "resources"))).toEqual([1, TIE_BREAK, 0, 0]);
  });

  it("minimises machines first, then raw resources", () => {
    expect(costs(weigh(model, ids, roles, "buildings"))).toEqual([TIE_BREAK, 1, 0, 0]);
  });

  it("changes nothing but the costs", () => {
    const weighed = weigh(model, ids, roles, "buildings");
    expect(weighed.nodes.map(({ cost: _cost, ...node }) => node)).toEqual(
      model.nodes.map(({ cost: _cost, ...node }) => node),
    );
    expect(model.nodes[0]?.cost).toBe(1);
  });
});
