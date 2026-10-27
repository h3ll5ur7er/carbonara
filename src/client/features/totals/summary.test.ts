import { describe, expect, it } from "vitest";
import type { Document } from "../../../contracts/document";
import type { Proposal } from "../../../contracts/managers";
import type { AnalysisResults } from "../../../contracts/results";
import plannerFixture from "../../scenes/planner.fixture.json";
import totalsFixture from "../../scenes/totals.fixture.json";
import { templatePack } from "../../scenes/template-pack";
import { factorySummary, summaryFacts } from "./summary";

// Both are the real engines' answers (src/managers/planning.test.ts keeps them current).
const works = totalsFixture as unknown as { document: Document; results: AnalysisResults };
const planned = plannerFixture as unknown as { proposal: Proposal };

describe("a factory's summary", () => {
  const summary = factorySummary(works.document, templatePack, works.results);

  it("reports the analysis's totals: raw inputs and buildings", () => {
    expect(summary.raw).toEqual(works.results.totals.raw);
    expect(summary.buildings).toEqual(works.results.totals.buildings);
  });

  it("adds up the power the buildings draw", () => {
    // Furnaces 0.5 MW, assemblers 0.75, purifiers 1.5, washers 1, per machine at 100%.
    const machines = (recipe: string) =>
      Object.entries(works.document.graph.nodes)
        .filter(([, node]) => node.kind === "recipe" && node.recipe === recipe)
        .reduce((total, [id]) => total + (works.results.nodes[id]?.activity ?? 0), 0);
    const expected =
      0.5 * (machines("iron-plate") + machines("copper-plate")) +
      0.75 * (machines("iron-gear") + machines("copper-wire")) +
      1.5 * machines("purify-water") +
      1 * machines("wash-ferrite");
    expect(summary.powerMW).toBeCloseTo(expected, 6);
    expect(summary.powerMW).toBeGreaterThan(0);
  });

  it("lists what leaves the factory, targets and byproducts alike", () => {
    expect(summary.outputs).toEqual({
      "iron-gear": expect.closeTo(230, 6),
      "copper-wire": expect.closeTo(320, 6),
      slag: expect.closeTo(160, 6),
      sludge: expect.closeTo(57.5, 6),
    });
  });

  it("uses the plugin's power where it derives one (Satisfactory's `power`, in MW)", () => {
    const derived = structuredClone(works.results);
    for (const result of Object.values(derived.nodes)) result.derived = { power: 2 };
    const recipes = Object.values(works.document.graph.nodes).filter((node) => node.kind === "recipe").length;
    expect(factorySummary(works.document, templatePack, derived).powerMW).toBeCloseTo(2 * recipes, 9);
  });

  it("adds up items whose ids are also names on plain objects", () => {
    const results: AnalysisResults = {
      ...works.results,
      diagnostics: [
        { kind: "surplus", node: "a", item: "constructor", perSecond: 1 },
        { kind: "surplus", node: "b", item: "constructor", perSecond: 2 },
      ],
    };
    expect(factorySummary(works.document, templatePack, results).byproducts).toEqual({ constructor: 3 });
  });

  it("counts shortages and unused byproducts from the diagnostics", () => {
    const results: AnalysisResults = {
      ...works.results,
      diagnostics: [
        { kind: "deficit", node: "a", item: "coal", perSecond: 1 },
        { kind: "deficit", node: "b", item: "coal", perSecond: 0.5 },
        { kind: "surplus", node: "c", item: "slag", perSecond: 2 },
      ],
    };
    const { shortfalls, byproducts } = factorySummary(works.document, templatePack, results);
    expect(shortfalls).toEqual({ coal: 1.5 });
    expect(byproducts).toEqual({ slag: 2 });
  });
});

describe("summary facts", () => {
  it("name buildings and items, largest first, with the map's limits", () => {
    const facts = summaryFacts(factorySummary(works.document, templatePack, works.results), templatePack);
    expect(facts.machines).toBe(1860 + 310 + 230 + 460);
    expect(facts.buildings.map((building) => building.name)).toEqual([
      "Furnace",
      "Ore Washer",
      "Assembler",
      "Water Purifier",
    ]);
    expect(facts.raw).toEqual([
      { item: expect.objectContaining({ id: "ferrite-ore" }), perSecond: 460, limitPerSecond: 500 },
      { item: expect.objectContaining({ id: "cuprite-ore" }), perSecond: 320, limitPerSecond: 300 },
      { item: expect.objectContaining({ id: "water", name: "Water" }), perSecond: 57.5 },
    ]);
  });

  it("sum a proposal up for its card the same way", () => {
    const facts = summaryFacts(planned.proposal.summary, templatePack);
    expect(facts.machines).toBe(17);
    expect(facts.byproducts.map((entry) => entry.item.id)).toEqual(["slag", "sludge"]);
    expect(facts.shortfalls).toEqual([]);
  });
});
