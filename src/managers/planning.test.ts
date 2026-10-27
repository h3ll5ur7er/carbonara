import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import templatePlugin from "../../packs/_template/plugin/index";
import { createMemoryDocumentStore } from "../access/documents/memory";
import type { LoadedPack, PackStore } from "../contracts/access";
import type { Command } from "../contracts/commands";
import { CURRENT_DOCUMENT_VERSION, type Document, type Graph } from "../contracts/document";
import type { PlanOptions, PlanTarget, Proposal } from "../contracts/managers";
import { compile, toResults } from "../engines/compiler";
import { templatePack } from "../engines/compiler/template.fixture";
import { applyCommands, type ResolvedCommand } from "../engines/editing/commands";
import { loadSolver, solve } from "../engines/solver";
import { createPlanningManager } from "./planning";

const template: LoadedPack = {
  info: {
    manifest: {
      id: "template",
      name: "Template Works",
      version: "1.0.0",
      engine: "^1",
      data: "data/",
      plugin: "plugin/index.js",
    },
    hash: "sha256-template",
    builtIn: true,
  },
  data: templatePack(),
  plugin: templatePlugin,
};

const packs: PackStore = {
  list: async () => [template.info],
  get: async (packId) => (packId === "template" ? template : undefined),
};

function factory(graph: Graph = { nodes: {}, edges: {} }, layout: Document["layout"] = {}): Document {
  return {
    format: "carbonara",
    version: CURRENT_DOCUMENT_VERSION,
    id: "doc",
    name: "Factory",
    pack: { id: "template", version: "1.0.0", hash: "sha256-template" },
    graph,
    blueprints: {},
    layout,
    settings: {},
  };
}

function setUp(document = factory()) {
  const documents = createMemoryDocumentStore();
  documents.put(document);
  return createPlanningManager({ documents, packs });
}

const defaults: PlanOptions = { objective: "resources", alternates: true, exclude: [] };

async function plan(targets: PlanTarget[], options: Partial<PlanOptions> = {}, document = factory()) {
  const result = await setUp(document).planProduction({
    documentId: document.id,
    targets,
    options: { ...defaults, ...options },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

/** The proposal applied to the document it was made for. */
function accept(proposal: Proposal, document = factory()): Document {
  const applied = applyCommands(document, proposal.commands as ResolvedCommand[]);
  if (!applied.ok) throw new Error(JSON.stringify(applied.error));
  return applied.value.document;
}

/** What the analysis manager would say about a document. */
async function analyse(document: Document) {
  const compiled = compile({ document, pack: template.data, plugin: templatePlugin });
  return toResults(compiled, await solve(compiled.model), templatePlugin, 1);
}

const added = (proposal: Proposal) =>
  proposal.commands.flatMap((command) => (command.type === "addNode" ? [command] : []));
const connected = (proposal: Proposal) =>
  proposal.commands.flatMap((command) => (command.type === "connect" ? [command] : []));
const recipesIn = (proposal: Proposal) =>
  added(proposal)
    .flatMap(({ node }) => (node.kind === "recipe" ? [node.recipe] : []))
    .sort();
const sum = (rates: Record<string, number>) => Object.values(rates).reduce((total, rate) => total + rate, 0);

beforeAll(async () => {
  await loadSolver(readFileSync(new URL("../engines/solver/wasm/solver_bg.wasm", import.meta.url)));
});

describe("planning production", () => {
  it("plans iron plates from washed ferrite, recycling the washer's water", async () => {
    const { summary } = await plan([{ item: "iron-plate", perSecond: 1 }]);
    expect(summary.buildings).toEqual({ furnace: 3, washer: 1, purifier: 1 });
    expect(summary.raw).toEqual({ "ferrite-ore": expect.closeTo(1, 9), water: expect.closeTo(0.125, 9) });
    expect(summary.byproducts).toEqual({ sludge: expect.closeTo(0.125, 9) });
    expect(summary.shortfalls).toEqual({});
    // 3 furnaces at 0.5 MW, a washer at 1 MW, half a purifier at 1.5 MW.
    expect(summary.powerMW).toBeCloseTo(3.25, 9);
  });

  it("proposes nodes and flows that solve without deficits for every item the template makes", async () => {
    const made = new Set(template.data.recipes.flatMap((recipe) => Object.keys(recipe.out)));
    for (const item of made) {
      const proposal = await plan([{ item, perSecond: 1 }]);
      const results = await analyse(accept(proposal));
      const problems = results.diagnostics.filter((diagnostic) => diagnostic.kind !== "surplus");
      expect({ item, problems }).toEqual({ item, problems: [] });
      const target = added(proposal).find(({ node }) => node.kind === "sink" && node.targetPerSecond !== undefined);
      expect(results.nodes[target?.id ?? ""]?.activity).toBeCloseTo(1, 6);
      // The document uses what the plan said it would.
      for (const [raw, perSecond] of Object.entries(proposal.summary.raw)) {
        expect(results.totals.raw[raw]).toBeCloseTo(perSecond, 6);
      }
    }
  });

  it("finds the cheapest mix: the coal-smelting alternate takes more raw resources", async () => {
    const standard = await plan([{ item: "iron-plate", perSecond: 1 }]);
    const alternate = await plan([{ item: "iron-plate", perSecond: 1 }], { exclude: ["iron-plate"] });
    expect(recipesIn(alternate)).toEqual(["iron-plate-from-ore"]);
    expect(alternate.summary.raw).toEqual({ "ferrite-ore": expect.closeTo(2, 9), coal: expect.closeTo(1, 9) });
    expect(sum(standard.summary.raw)).toBeLessThan(sum(alternate.summary.raw));
  });

  it("uses fewer buildings when asked, even if that takes more raw resources", async () => {
    const { summary } = await plan([{ item: "iron-plate", perSecond: 1 }], { objective: "buildings" });
    // The purifier only saves water.
    expect(summary.buildings).toEqual({ furnace: 3, washer: 1 });
    expect(summary.raw.water).toBeCloseTo(0.5, 9);
  });

  it("leaves a lossy loop alone: motors are never recycled into motors", async () => {
    const proposal = await plan([{ item: "motor", perSecond: 0.25 }]);
    expect(recipesIn(proposal)).not.toContain("recycle-motor");
    // Motors 2.5, gears 0.5, circuits 1.25, wire 0.4375: each node rounded up.
    expect(proposal.summary.buildings.assembler).toBe(3 + 1 + 2 + 1);
  });

  it("uses byproducts where they're needed and sends the rest to outputs", async () => {
    const proposal = await plan([{ item: "concrete", perSecond: 1 }]);
    expect(recipesIn(proposal)).toEqual(["concrete", "copper-plate", "purify-water", "wash-ferrite"]);
    expect(proposal.summary.byproducts).toEqual({
      "copper-plate": expect.closeTo(2, 9),
      "clean-ferrite": expect.closeTo(8, 9),
    });
    const outputs = added(proposal).flatMap(({ node }) => (node.kind === "sink" ? [node] : []));
    expect(outputs).toEqual(
      expect.arrayContaining([
        { kind: "sink", item: "concrete", targetPerSecond: 1 },
        { kind: "sink", item: "copper-plate" },
        { kind: "sink", item: "clean-ferrite" },
      ]),
    );
  });

  it("says what the map can't supply", async () => {
    const { summary } = await plan([{ item: "iron-plate", perSecond: 600 }], { alternates: false });
    expect(summary.raw["ferrite-ore"]).toBeCloseTo(500, 6);
    expect(sum(summary.shortfalls)).toBeGreaterThan(0);
  });

  it("plans several targets at once", async () => {
    const proposal = await plan([
      { item: "iron-gear", perSecond: 1 },
      { item: "copper-wire", perSecond: 2 },
    ]);
    expect(proposal.targets).toEqual([
      { item: "iron-gear", perSecond: 1 },
      { item: "copper-wire", perSecond: 2 },
    ]);
    expect(recipesIn(proposal)).toEqual([
      "copper-plate",
      "copper-wire",
      "iron-gear",
      "iron-plate",
      "purify-water",
      "wash-ferrite",
    ]);
  });

  it("lays the plan out left to right: raw inputs first, the target last", async () => {
    const proposal = await plan([{ item: "iron-gear", perSecond: 1 }]);
    const x = (predicate: (command: Extract<Command, { type: "addNode" }>) => boolean) =>
      added(proposal).find(predicate)?.position.x ?? Number.NaN;
    const ore = x(({ node }) => node.kind === "source" && node.item === "ferrite-ore");
    const gears = x(({ node }) => node.kind === "recipe" && node.recipe === "iron-gear");
    const target = x(({ node }) => node.kind === "sink" && node.item === "iron-gear");
    expect(ore).toBeLessThan(gears);
    expect(gears).toBeLessThan(target);
  });

  it("goes beside the existing factory, with ids the document doesn't use yet", async () => {
    const existing = factory(
      { nodes: { "iron-plate": { kind: "recipe", recipe: "iron-plate" } }, edges: {} },
      { root: { "iron-plate": { x: 240, y: 96 } } },
    );
    const proposal = await plan([{ item: "iron-plate", perSecond: 1 }], {}, existing);
    const ids = added(proposal).map((command) => command.id);
    expect(ids).toContain("iron-plate-2");
    expect(ids).not.toContain("iron-plate");
    // The existing card is 312 wide.
    for (const command of added(proposal)) expect(command.position.x).toBeGreaterThan(240 + 312);
    expect(Math.min(...added(proposal).map((command) => command.position.y))).toBe(96);
    expect(() => accept(proposal, existing)).not.toThrow();
  });

  it("starts at the origin in an empty document", async () => {
    const proposal = await plan([{ item: "iron-plate", perSecond: 1 }]);
    expect(Math.min(...added(proposal).map((command) => command.position.x))).toBe(0);
    expect(Math.min(...added(proposal).map((command) => command.position.y))).toBe(0);
  });

  it("previews its solve under the ids of its commands", async () => {
    const proposal = await plan([{ item: "iron-plate", perSecond: 1 }]);
    expect(Object.keys(proposal.results.nodes).sort()).toEqual(
      added(proposal)
        .map((command) => command.id)
        .sort(),
    );
    expect(Object.keys(proposal.results.edges).sort()).toEqual(
      connected(proposal)
        .map((command) => command.id)
        .sort(),
    );
    const smelter = added(proposal).find(({ node }) => node.kind === "recipe" && node.recipe === "iron-plate");
    expect(proposal.results.nodes[smelter?.id ?? ""]?.activity).toBeCloseTo(3, 9);
  });

  it("refuses unknown documents and items", async () => {
    const planning = setUp();
    expect(
      await planning.planProduction({
        documentId: "nope",
        targets: [{ item: "iron-plate", perSecond: 1 }],
        options: defaults,
      }),
    ).toMatchObject({ ok: false, error: [{ path: ["documentId"] }] });
    expect(
      await planning.planProduction({
        documentId: "doc",
        targets: [{ item: "gold", perSecond: 1 }],
        options: defaults,
      }),
    ).toMatchObject({ ok: false, error: [{ path: ["targets", 0, "item"] }] });
  });
});

describe("comparing recipes", () => {
  it("plans the item once with each recipe that makes it, best first", async () => {
    const result = await setUp().compareRecipes({
      documentId: "doc",
      item: "iron-plate",
      perSecond: 1,
      options: defaults,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.map((comparison) => comparison.recipe)).toEqual(["iron-plate", "iron-plate-from-ore"]);
    expect(result.value[1]?.summary.raw).toEqual({ "ferrite-ore": expect.closeTo(2, 9), coal: expect.closeTo(1, 9) });
  });

  it("ranks by buildings when that's the objective", async () => {
    const result = await setUp().compareRecipes({
      documentId: "doc",
      item: "iron-plate",
      perSecond: 1,
      options: { ...defaults, objective: "buildings" },
    });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    // 4 furnaces either way; the standard recipe wins on raw resources.
    expect(result.value.map((comparison) => comparison.recipe)).toEqual(["iron-plate", "iron-plate-from-ore"]);
  });

  it("makes the item with the recipe compared, even when it's also a raw resource", async () => {
    const result = await setUp().compareRecipes({ documentId: "doc", item: "coal", perSecond: 1, options: defaults });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.map((comparison) => comparison.recipe)).toEqual(["dry-sludge"]);
    expect(result.value[0]?.summary.raw.coal).toBeUndefined();
    expect(result.value[0]?.summary.buildings).toMatchObject({ furnace: 6, purifier: 12, washer: 24 });
  });
});

/**
 * The `planner` scene (src/client/scenes/planner.tsx) shows a real proposal next to a small copper line. Scenes
 * can't call managers, so the scene reads this fixture; it fails here when the planner's answer changes.
 * Regenerate it with `UPDATE_FIXTURES=1 pnpm vitest run src/managers/planning.test.ts`.
 */
describe("the planner scene's fixture", () => {
  const file = new URL("../client/scenes/planner.fixture.json", import.meta.url);

  function copperLine(): Document {
    const document = factory(
      {
        nodes: {
          ore: { kind: "source", item: "cuprite-ore" },
          plates: { kind: "recipe", recipe: "copper-plate" },
          wire: { kind: "recipe", recipe: "copper-wire" },
          slag: { kind: "sink", item: "slag" },
          out: { kind: "sink", item: "copper-wire", targetPerSecond: 2 },
        },
        edges: {
          "ore-plates": { from: "ore", to: "plates", item: "cuprite-ore", logistics: "conveyor-1" },
          "plates-wire": { from: "plates", to: "wire", item: "copper-plate", logistics: "conveyor-1" },
          "plates-slag": { from: "plates", to: "slag", item: "slag", logistics: "conveyor-1" },
          "wire-out": { from: "wire", to: "out", item: "copper-wire", logistics: "conveyor-1" },
        },
      },
      {
        root: {
          ore: { x: 0, y: 72 },
          plates: { x: 360, y: 0 },
          wire: { x: 768, y: 0 },
          slag: { x: 768, y: 216 },
          out: { x: 1176, y: 72 },
        },
      },
    );
    return { ...document, id: "scene-planner", name: "Copper works", settings: { rateUnit: "per_minute" } };
  }

  it("is what the planner proposes for 15 motors a minute beside a copper line", async () => {
    const document = copperLine();
    const results = await analyse(document);
    const proposal = await plan([{ item: "motor", perSecond: 0.25 }], {}, document);
    const fixture = JSON.parse(JSON.stringify({ document, results, proposal })) as unknown;
    if (process.env.UPDATE_FIXTURES || !existsSync(file)) writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(fixture);
  });

  /** The `totals` scene: a planned gear and wire works that takes more cuprite than the map has. */
  it("is a planned factory and its analysis for the totals scene", async () => {
    const totals = new URL("../client/scenes/totals.fixture.json", import.meta.url);
    const empty = { ...factory(), id: "scene-totals", name: "Gear and wire works" };
    const proposal = await plan(
      [
        { item: "iron-gear", perSecond: 230 },
        { item: "copper-wire", perSecond: 280 },
      ],
      {},
      empty,
    );
    const document: Document = { ...accept(proposal, empty), settings: { rateUnit: "per_minute" } };
    // Ferrite runs at 92% of the map's 500/s. The wire was planned at 280/s (280 cuprite/s of the map's 300);
    // asking for 320/s takes 320 cuprite/s, more than the map has.
    const wire = Object.entries(document.graph.nodes).find(
      ([, node]) => node.kind === "sink" && node.item === "copper-wire",
    );
    const busy = { ...document, graph: { ...document.graph, nodes: { ...document.graph.nodes } } };
    if (wire) busy.graph.nodes[wire[0]] = { kind: "sink", item: "copper-wire", targetPerSecond: 320 };
    const results = await analyse(busy);
    const fixture = JSON.parse(JSON.stringify({ document: busy, results })) as unknown;
    if (process.env.UPDATE_FIXTURES || !existsSync(totals))
      writeFileSync(totals, `${JSON.stringify(fixture, null, 2)}\n`);
    expect(JSON.parse(readFileSync(totals, "utf8"))).toEqual(fixture);
  });
});
