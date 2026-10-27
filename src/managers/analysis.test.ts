import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import templatePlugin from "../../packs/_template/plugin/index";
import type { DocumentStore, LoadedPack, OpenDocument, PackStore } from "../contracts/access";
import type { Document } from "../contracts/document";
import type { Events } from "../contracts/managers";
import type { AnalysisResults } from "../contracts/results";
import { compile } from "../engines/compiler";
import { platesModule, templatePack, waterLoop } from "../engines/compiler/template.fixture";
import { copyNodes, pasteCommands } from "../engines/editing/clipboard";
import { applyCommands, type ResolvedCommand } from "../engines/editing/commands";
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
    recent: () => [],
    takeRecent: () => undefined,
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
  /** What the editing manager does: store the document, then announce the change (here: all of it). */
  const edit = (document: Document) => {
    const { version } = documents.put(document);
    bus.publish("documentChanged", {
      documentId: document.id,
      version,
      patches: [{ op: "replace", path: [], value: document }],
    });
  };
  /** Commands applied as the editing manager applies them, announced with the patches they make. */
  const command = (documentId: string, commands: ResolvedCommand[]) => {
    const open = documents.get(documentId);
    if (!open) throw new Error("not open");
    const applied = applyCommands(open.document, commands);
    if (!applied.ok) throw new Error(JSON.stringify(applied.error));
    const { version } = documents.put(applied.value.document);
    bus.publish("documentChanged", { documentId, version, patches: applied.value.patches });
  };
  const nextResults = () =>
    new Promise<AnalysisResults>((resolve) => {
      const unsubscribe = bus.subscribe("resultsChanged", (results) => {
        unsubscribe();
        resolve(results);
      });
    });
  return { bus, documents, analysis, published, edit, command, nextResults };
}

/** Every number to 12 significant digits. */
function rounded(value: unknown): unknown {
  if (typeof value === "number") return Number(value.toPrecision(12));
  if (Array.isArray(value)) return value.map(rounded);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, rounded(inner)]));
  }
  return value;
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

  it("follows edits by their patches, with the results a fresh solve of each version gets", async () => {
    const { edit, command, documents, analysis } = setUp();
    edit(waterLoop());
    await analysis.getResults({ documentId: "doc-water", graph: "root" });
    let pasted = 0;
    // A paste, as the editing manager makes one: new nodes and flows, and their layout.
    const paste = (document: Document): ResolvedCommand[] => {
      const copied = copyNodes(document, "root", ["plates", "wash"]);
      if (!copied.ok) throw new Error(JSON.stringify(copied.error));
      const options = { offset: { x: 400, y: 0 }, connections: true };
      const made = pasteCommands(document, "root", copied.value, options, () => `pasted${pasted++}`);
      if (!made.ok) throw new Error(JSON.stringify(made.error));
      return made.value.commands;
    };
    const edits: (ResolvedCommand[] | typeof paste)[] = [
      [{ type: "setPin", graph: "root", id: "smelt", pin: { type: "machines", count: 2 } }],
      [{ type: "setRate", graph: "root", id: "plates", perSecond: 2 }],
      [{ type: "removeNodes", graph: "root", ids: ["purify"] }],
      [{ type: "setPin", graph: "root", id: "smelt", pin: null }],
      // Blueprints made, renamed, edited inside and dissolved: patches under `blueprints/…`.
      [{ type: "collapse", graph: "root", ids: ["smelt", "wash"], blueprint: "cell", instance: "cell1", name: "Cell" }],
      [{ type: "renameBlueprint", blueprint: "cell", name: "Smelting cell" }],
      [{ type: "setPin", graph: "cell", id: "smelt", pin: { type: "machines", count: 4 } }],
      [{ type: "setRate", graph: "root", id: "plates", perSecond: 1.5 }],
      // A copy of the blueprint, placed, edited inside and deleted with its instance.
      (document: Document): ResolvedCommand[] => [
        {
          type: "addBlueprint",
          id: "variant",
          blueprint: { name: "Variant", graph: document.blueprints.cell?.graph ?? { nodes: {}, edges: {} } },
          layout: document.layout.cell ?? {},
        },
        {
          type: "addNode",
          graph: "root",
          id: "variant1",
          node: { kind: "instance", blueprint: "variant" },
          position: { x: 0, y: 400 },
        },
      ],
      [{ type: "setPin", graph: "variant", id: "smelt", pin: { type: "machines", count: 1 } }],
      [{ type: "removeBlueprint", blueprint: "variant" }],
      [{ type: "expand", graph: "root", id: "cell1" }],
      [{ type: "setRate", graph: "root", id: "plates", perSecond: 3 }],
      paste,
      [{ type: "setRate", graph: "root", id: "plates", perSecond: 1 }],
      // A paste from another factory, bringing the blueprint its instance places along.
      (document: Document): ResolvedCommand[] => {
        const elsewhere = applyCommands(document, [
          { type: "collapse", graph: "root", ids: ["smelt"], blueprint: "far", instance: "far1", name: "Far" },
        ]);
        if (!elsewhere.ok) throw new Error(JSON.stringify(elsewhere.error));
        const copied = copyNodes({ ...elsewhere.value.document, id: "doc-far" }, "root", ["far1"]);
        if (!copied.ok) throw new Error(JSON.stringify(copied.error));
        const options = { offset: { x: 0, y: 600 }, connections: false };
        const made = pasteCommands(document, "root", copied.value, options, () => `pasted${pasted++}`);
        if (!made.ok) throw new Error(JSON.stringify(made.error));
        expect(made.value.commands[0]?.type).toBe("addBlueprint");
        return made.value.commands;
      },
      [{ type: "setRate", graph: "root", id: "plates", perSecond: 0.5 }],
    ];
    for (const step of edits) {
      const current = documents.get("doc-water")?.document as Document;
      command("doc-water", typeof step === "function" ? step(current) : step);
      const followed = await analysis.getResults({ documentId: "doc-water", graph: "root" });
      // Another manager, which sees each version whole.
      const fresh = setUp();
      fresh.edit(documents.get("doc-water")?.document as Document);
      const expected = await fresh.analysis.getResults({ documentId: "doc-water", graph: "root" });
      // The solver re-solves from its last solve, so the last bits may differ.
      expect(rounded(followed)).toEqual(rounded({ ...expected, version: followed?.version }));
    }
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

  it("has no results for unknown documents and graphs", async () => {
    const { documents, analysis } = setUp();
    documents.put(waterLoop());
    expect(await analysis.getResults({ documentId: "nope", graph: "root" })).toBeNull();
    expect(await analysis.getResults({ documentId: "doc-water", graph: "rods" })).toBeNull();
  });

  it("solves a blueprint's inside only when asked, for the boundary flows of its instances", async () => {
    const { edit, nextResults, published, analysis } = setUp();
    const solved = nextResults();
    edit(platesModule(3));
    const root = await solved;
    expect(root.nodes.module?.activity).toBeCloseTo(3, 9);
    expect(published.map((results) => results.graph)).toEqual(["root"]);
    const inside = await analysis.getResults({ documentId: "doc-plates", graph: "plates" });
    expect(inside?.graph).toBe("plates");
    expect(inside?.version).toBe(1);
    expect(inside?.nodes.smelt?.activity).toBeCloseTo(9, 9);
    expect(await analysis.getResults({ documentId: "doc-plates", graph: "plates" })).toBe(inside);
    expect(published.map((results) => results.graph)).toEqual(["root"]);
  });

  it("publishes a watched blueprint's results with every solve until it is unwatched", async () => {
    const { edit, published, analysis } = setUp();
    edit(platesModule(1));
    await analysis.getResults({ documentId: "doc-plates", graph: "root" });
    await analysis.watchResults({ documentId: "doc-plates", graph: "plates" });
    await analysis.watchResults({ documentId: "doc-plates", graph: "plates" });
    edit(platesModule(2));
    await analysis.getResults({ documentId: "doc-plates", graph: "root" });
    // Two watches, one unwatch: still watched.
    await analysis.unwatchResults({ documentId: "doc-plates", graph: "plates" });
    edit(platesModule(3));
    await analysis.getResults({ documentId: "doc-plates", graph: "root" });
    await analysis.unwatchResults({ documentId: "doc-plates", graph: "plates" });
    edit(platesModule(4));
    await analysis.getResults({ documentId: "doc-plates", graph: "root" });
    const watched = published.filter((results) => results.graph === "plates");
    expect(watched.map((results) => [results.version, results.nodes.smelt?.activity])).toEqual([
      [2, expect.closeTo(6, 9)],
      [3, expect.closeTo(9, 9)],
    ]);
  });

  it("solves two instances of a blueprint with one summary, and an edit of the blueprint changes both", async () => {
    // The plates module placed twice, each copy with an ore supply and a target of its own.
    const once = platesModule(2);
    const twice = applyCommands(once, [
      {
        type: "addNode",
        graph: "root",
        id: "ferrite2",
        node: { kind: "source", item: "clean-ferrite" },
        position: { x: 0, y: 0 },
      },
      {
        type: "addNode",
        graph: "root",
        id: "module2",
        node: { kind: "instance", blueprint: "plates" },
        position: { x: 0, y: 0 },
      },
      {
        type: "addNode",
        graph: "root",
        id: "out2",
        node: { kind: "sink", item: "iron-plate", targetPerSecond: 2 },
        position: { x: 0, y: 0 },
      },
      {
        type: "connect",
        graph: "root",
        id: "in2",
        edge: { from: "ferrite2", to: "module2", toPort: "in", item: "clean-ferrite" },
      },
      {
        type: "connect",
        graph: "root",
        id: "out2",
        edge: { from: "module2", fromPort: "out", to: "out2", item: "iron-plate" },
      },
    ]);
    if (!twice.ok) throw new Error(JSON.stringify(twice.error));
    const document = twice.value.document;
    // One blueprint in the model: both instances place the same one, so the solver summarises it once.
    const { model } = compile({ document, pack: templatePack(), plugin: templatePlugin });
    expect(model.blueprints).toHaveLength(1);
    expect(model.nodes.filter((node) => node.kind === "instance").map((node) => node.blueprint)).toEqual([0, 0]);

    const { edit, nextResults } = setUp();
    let results = nextResults();
    edit(document);
    const before = await results;
    // Designed for 3 furnaces (1 plate/s): each copy runs twice over for its 2 plates/s.
    expect(before.nodes.module?.activity).toBeCloseTo(2, 9);
    expect(before.nodes.module2?.activity).toBeCloseTo(2, 9);

    // Six furnaces inside: the design makes 2 plates/s, so each copy runs once.
    const bigger = applyCommands(document, [
      { type: "setPin", graph: "plates", id: "smelt", pin: { type: "machines", count: 6 } },
    ]);
    if (!bigger.ok) throw new Error(JSON.stringify(bigger.error));
    results = nextResults();
    edit(bigger.value.document);
    const after = await results;
    expect(after.nodes.module?.activity).toBeCloseTo(1, 9);
    expect(after.nodes.module2?.activity).toBeCloseTo(1, 9);
    expect(after.nodes.module2?.outputs["iron-plate"]).toBeCloseTo(2, 9);
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
