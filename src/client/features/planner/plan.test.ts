import { describe, expect, it } from "vitest";
import type { Proposal } from "../../../contracts/managers";
import { templatePack } from "../../scenes/template-pack";
import { PackData } from "../../../contracts/pack";
import {
  buildingFamilies,
  findItems,
  goalsOf,
  planLabel,
  preferBuilding,
  proposalGhost,
  targetsPerSecond,
} from "./plan";

const proposal: Proposal = {
  id: "proposal-1",
  documentId: "doc",
  targets: [{ item: "copper-plate", perSecond: 1 }],
  commands: [
    {
      type: "addNode",
      graph: "root",
      id: "source-cuprite-ore",
      node: { kind: "source", item: "cuprite-ore" },
      position: { x: 0, y: 24 },
    },
    {
      type: "addNode",
      graph: "root",
      id: "copper-plate",
      node: { kind: "recipe", recipe: "copper-plate" },
      position: { x: 360, y: 0 },
    },
    {
      type: "connect",
      graph: "root",
      id: "ore-plate",
      edge: { from: "source-cuprite-ore", to: "copper-plate", item: "cuprite-ore" },
    },
  ],
  results: {
    nodes: { "copper-plate": { activity: 3, inputs: { "cuprite-ore": 2 }, outputs: { "copper-plate": 1 } } },
    edges: { "ore-plate": { perSecond: 2 } },
  },
  summary: {
    buildings: { furnace: 3 },
    raw: { "cuprite-ore": 2 },
    byproducts: { slag: 1 },
    shortfalls: {},
    powerMW: 1.5,
  },
};

describe("planning in the client", () => {
  it("asks for rates in items per second, whatever unit the document shows", () => {
    expect(
      targetsPerSecond(
        [
          { key: 1, item: "motor", rate: 15 },
          { key: 2, item: null, rate: 30 },
          { key: 3, item: "circuit", rate: 0 },
        ],
        "per_minute",
      ),
    ).toEqual([{ item: "motor", perSecond: 0.25 }]);
  });

  it("previews a proposal as a ghost of the nodes and flows it adds, where it would add them", () => {
    const ghost = proposalGhost(proposal, { x: 48, y: 0 });
    expect(Object.keys(ghost.graph.nodes)).toEqual(["source-cuprite-ore", "copper-plate"]);
    expect(ghost.graph.edges["ore-plate"]).toEqual({
      from: "source-cuprite-ore",
      to: "copper-plate",
      item: "cuprite-ore",
    });
    expect(ghost.positions["copper-plate"]).toEqual({ x: 360, y: 0 });
    expect(ghost.results).toBe(proposal.results);
    expect(ghost.placement).toEqual({ mode: "fixed", offset: { x: 48, y: 0 } });
  });

  it("turns a proposal's targets back into goals in the document's unit, to adjust them", () => {
    let key = 0;
    const goals = goalsOf(
      [
        { item: "motor", perSecond: 0.25 },
        { item: "circuit", perSecond: 1 / 3 },
      ],
      "per_minute",
      () => ++key,
    );
    expect(goals).toEqual([
      { key: 1, item: "motor", rate: 15 },
      { key: 2, item: "circuit", rate: 20 },
    ]);
    expect(targetsPerSecond(goals, "per_minute")).toEqual([
      { item: "motor", perSecond: 0.25 },
      { item: "circuit", perSecond: 1 / 3 },
    ]);
  });

  it("names the undo step after the targets, in the document's unit", () => {
    expect(planLabel(proposal.targets, templatePack, "per_minute")).toBe("Plan 60/min Copper Plate");
    expect(
      planLabel(
        [
          { item: "motor", perSecond: 0.25 },
          { item: "circuit", perSecond: 1 },
        ],
        templatePack,
        "per_second",
      ),
    ).toBe("Plan 0.25/s Motor, 1/s Circuit");
  });

  it("finds items by name, alias or id, names that start with the words first", () => {
    expect(findItems(templatePack, "plate").map((item) => item.id)).toEqual(["iron-plate", "copper-plate"]);
    expect(findItems(templatePack, "gear")[0]?.id).toBe("iron-gear");
    expect(findItems(templatePack, "wire")[0]?.id).toBe("copper-wire");
    expect(findItems(templatePack, "co")[0]?.id).toBe("coal");
    // Without a query: what recipes make, before raw resources.
    const all = findItems(templatePack, "");
    expect(all[0]?.id).not.toBe("ferrite-ore");
    expect(all).toHaveLength(templatePack.items.length);
  });

  it("groups buildings that stand in for each other into families, by their default building", () => {
    const building = (id: string) => ({ id, name: id.toUpperCase() });
    const recipe = (id: string, buildings: string[]) => ({ id, buildings, time: 1, out: { [id]: 1 } });
    const pack = PackData.parse({
      units: { rate: "per_second" },
      items: [],
      buildings: ["stone", "steel", "electric", "am1", "am2", "am3", "foundry", "refinery"].map(building),
      recipes: [
        recipe("plate", ["stone", "steel", "electric"]),
        recipe("gear", ["am1", "am2", "am3"]),
        recipe("engine", ["am2", "am3", "foundry"]),
        recipe("oil", ["refinery"]),
      ],
      logistics: [],
      resources: [],
    });
    const families = buildingFamilies(pack);
    expect(families.map(({ base, members }) => [base.id, members.map(({ id }) => id)])).toEqual([
      ["stone", ["stone", "steel", "electric"]],
      ["am1", ["am1", "am2", "am3", "foundry"]],
    ]);
    const [furnaces, assemblers] = families as [(typeof families)[0], (typeof families)[0]];
    let preferred = preferBuilding([], furnaces, "steel");
    preferred = preferBuilding(preferred, assemblers, "am3");
    expect(preferred).toEqual(["steel", "am3"]);
    expect(preferBuilding(preferred, furnaces, "electric")).toEqual(["am3", "electric"]);
    expect(preferBuilding(preferred, furnaces, "stone")).toEqual(["am3"]);
  });
});
