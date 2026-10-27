import { describe, expect, it } from "vitest";
import type { Proposal } from "../../../contracts/managers";
import { templatePack } from "../../scenes/template-pack";
import { acceptedCommands, findItems, planLabel, proposalGhost, summaryFacts, targetsPerSecond } from "./plan";

const proposal: Proposal = {
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

  it("accepts the proposal where the ghost was moved to", () => {
    const commands = acceptedCommands(proposal, { x: 48, y: -24 });
    expect(commands.map((command) => (command.type === "addNode" ? command.position : command.type))).toEqual([
      { x: 48, y: 0 },
      { x: 408, y: -24 },
      "connect",
    ]);
    expect(proposal.commands[0]).toMatchObject({ position: { x: 0, y: 24 } });
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

  it("sums a proposal up for its card: machines, power, raw inputs against the map", () => {
    const facts = summaryFacts(
      { ...proposal.summary, buildings: { furnace: 3, assembler: 2 }, raw: { "ferrite-ore": 400, water: 2 } },
      templatePack,
    );
    expect(facts.machines).toBe(5);
    expect(facts.buildings).toEqual([
      { id: "furnace", name: "Furnace", count: 3 },
      { id: "assembler", name: "Assembler", count: 2 },
    ]);
    expect(facts.raw).toEqual([
      { item: expect.objectContaining({ id: "ferrite-ore" }), perSecond: 400, limitPerSecond: 500 },
      { item: expect.objectContaining({ id: "water" }), perSecond: 2 },
    ]);
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
});
