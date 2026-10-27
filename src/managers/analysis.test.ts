import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import templatePlugin from "../../packs/_template/plugin/index";
import type { DocumentStore, LoadedPack, OpenDocument, PackStore } from "../contracts/access";
import type { Document } from "../contracts/document";
import type { Events } from "../contracts/managers";
import type { AnalysisResults } from "../contracts/results";
import { templatePack, waterLoop } from "../engines/compiler/template.fixture";
import { loadSolver } from "../engines/solver";
import { createEventBus } from "../utilities/events";
import { createAnalysisManager } from "./analysis";

/** The documents open in this session, in memory. */
function memoryDocuments(): DocumentStore {
  const open = new Map<string, OpenDocument>();
  return {
    list: () =>
      [...open.values()].map(({ document, version }) => ({
        id: document.id,
        name: document.name,
        packId: document.pack.id,
        version,
      })),
    get: (documentId) => open.get(documentId),
    put(document) {
      const stored = { document, version: (open.get(document.id)?.version ?? 0) + 1 };
      open.set(document.id, stored);
      return stored;
    },
    remove: (documentId) => void open.delete(documentId),
  };
}

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

/** Packs that answer after a tick, like real storage. */
function memoryPacks(packs: LoadedPack[]): PackStore {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
  return {
    list: async () => packs.map((pack) => pack.info),
    get: async (packId) => {
      await tick();
      return packs.find((pack) => pack.info.manifest.id === packId);
    },
  };
}

function setUp(packs = [template]) {
  const bus = createEventBus<Events>();
  const documents = memoryDocuments();
  const analysis = createAnalysisManager({ bus, documents, packs: memoryPacks(packs) });
  const published: AnalysisResults[] = [];
  bus.subscribe("resultsChanged", (results) => published.push(results));
  /** What the editing manager does: store the document, then announce the change. */
  const edit = (document: Document) => {
    const { version } = documents.put(document);
    bus.publish("documentChanged", { documentId: document.id, version, patches: [] });
  };
  const nextResults = () =>
    new Promise<AnalysisResults>((resolve) => {
      const unsubscribe = bus.subscribe("resultsChanged", (results) => {
        unsubscribe();
        resolve(results);
      });
    });
  return { bus, documents, analysis, published, edit, nextResults };
}

function withTarget(perSecond: number): Document {
  const document = waterLoop();
  document.graph.nodes.plates = { kind: "sink", item: "iron-plate", targetPerSecond: perSecond };
  return document;
}

beforeAll(async () => {
  await loadSolver(readFileSync(new URL("../engines/solver/wasm/solver_bg.wasm", import.meta.url)));
});

describe("the analysis manager", () => {
  it("solves a document when it changes and publishes the results", async () => {
    const { edit, nextResults } = setUp();
    const published = nextResults();
    edit(waterLoop());
    const results = await published;
    expect(results.documentId).toBe("doc-water");
    expect(results.version).toBe(1);
    expect(results.nodes.wash?.activity).toBeCloseTo(1, 9);
    expect(results.nodes.smelt?.activity).toBeCloseTo(3, 9);
    expect(results.edges["purify-merge"]?.perSecond).toBeCloseTo(0.375, 9);
  });

  it("totals raw inputs and buildings of the template's water loop", async () => {
    const { edit, nextResults } = setUp();
    const published = nextResults();
    edit(waterLoop());
    const { totals, diagnostics } = await published;
    expect(totals.buildings).toEqual({ furnace: 3, purifier: 1, washer: 1 });
    expect(totals.raw["ferrite-ore"]).toBeCloseTo(1, 9);
    expect(totals.raw.water).toBeCloseTo(0.125, 9);
    expect(diagnostics).toEqual([
      { kind: "surplus", node: "purify", item: "sludge", perSecond: expect.closeTo(0.125, 9) },
    ]);
  });

  it("drops results that a newer edit made stale", async () => {
    const { edit, published, analysis } = setUp();
    edit(withTarget(1));
    edit(withTarget(2));
    edit(withTarget(3));
    const results = await analysis.getResults({ documentId: "doc-water", graph: "root" });
    expect(results?.version).toBe(3);
    expect(results?.nodes.smelt?.activity).toBeCloseTo(9, 9);
    expect(published.map((r) => r.version)).toEqual([3]);
  });

  it("answers getResults with the latest results, solving first when there are none yet", async () => {
    const { documents, analysis, published } = setUp();
    documents.put(waterLoop());
    const results = await analysis.getResults({ documentId: "doc-water", graph: "root" });
    expect(results?.nodes.wash?.activity).toBeCloseTo(1, 9);
    expect(await analysis.getResults({ documentId: "doc-water", graph: "root" })).toBe(results);
    expect(published).toHaveLength(1);
  });

  it("re-solves only the components an edit touched", async () => {
    const { edit, analysis } = setUp();
    const twoLines = waterLoop();
    twoLines.graph.nodes.coal = { kind: "source", item: "coal" };
    twoLines.graph.nodes.burnt = { kind: "sink", item: "coal", targetPerSecond: 1 };
    twoLines.graph.edges["coal-burnt"] = { from: "coal", to: "burnt", item: "coal" };
    edit(twoLines);
    await analysis.getResults({ documentId: "doc-water", graph: "root" });
    const edited = structuredClone(twoLines);
    edited.graph.nodes.burnt = { kind: "sink", item: "coal", targetPerSecond: 2 };
    edit(edited);
    const results = await analysis.getResults({ documentId: "doc-water", graph: "root" });
    expect(results?.nodes.coal?.activity).toBeCloseTo(2, 9);
    expect(analysis.lastSolved("doc-water")).toBe(1);
  });

  it("says so when the document's pack isn't installed", async () => {
    const { edit, nextResults } = setUp([]);
    const published = nextResults();
    edit(waterLoop());
    const results = await published;
    expect(results.nodes).toEqual({});
    expect(results.diagnostics).toEqual([{ kind: "error", message: 'The pack "template" isn\'t installed' }]);
  });

  it("shows a failing plugin as an error on the document instead of keeping old numbers", async () => {
    const broken: LoadedPack = {
      ...template,
      plugin: {
        id: "broken",
        effectiveRecipe: () => {
          throw new Error("no clock field");
        },
      },
    };
    const { edit, nextResults } = setUp([broken]);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const published = nextResults();
    edit(waterLoop());
    const results = await published;
    quiet.mockRestore();
    expect(results.diagnostics).toEqual([{ kind: "error", message: "Internal error while solving: no clock field" }]);
  });

  it("has no results for unknown documents and for blueprints", async () => {
    const { documents, analysis } = setUp();
    documents.put(waterLoop());
    expect(await analysis.getResults({ documentId: "nope", graph: "root" })).toBeNull();
    expect(await analysis.getResults({ documentId: "doc-water", graph: "rods" })).toBeNull();
  });

  it("forgets closed documents", async () => {
    const { bus, documents, edit, analysis } = setUp();
    edit(waterLoop());
    await analysis.getResults({ documentId: "doc-water", graph: "root" });
    documents.remove("doc-water");
    bus.publish("documentsChanged", { documents: documents.list() });
    expect(await analysis.getResults({ documentId: "doc-water", graph: "root" })).toBeNull();
  });
});
