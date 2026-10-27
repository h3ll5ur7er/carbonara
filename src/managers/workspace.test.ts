import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { createMemoryDocumentStore } from "../access/documents/memory";
import type { PackStore } from "../contracts/access";
import { Document } from "../contracts/document";
import { exampleDocument } from "../contracts/document.fixture";
import type { Events, PackInfo } from "../contracts/managers";
import { PackData, PackManifest } from "../contracts/pack";
import { createPreferenceStore } from "../access/preferences/preferences";
import { createEventBus } from "../utilities/events";
import { createMemoryKeyValueStorage } from "../utilities/memory-key-value";
import { createWorkspaceManager } from "./workspace";

const template: PackInfo = {
  manifest: PackManifest.parse({
    id: "template",
    name: "Template Works",
    version: "1.0.0",
    engine: "^1",
    plugin: "p.js",
  }),
  hash: "sha256-template",
  builtIn: true,
};

const starter = {
  id: "wire",
  name: "Copper wire",
  graph: { nodes: { ore: { kind: "source", item: "cuprite-ore" } }, edges: {} },
  layout: { root: { ore: { x: 0, y: 0 } } },
  settings: { rateUnit: "per_minute" },
};

function setup() {
  const documents = createMemoryDocumentStore();
  const events = createEventBus<Events>();
  const lists: string[][] = [];
  const names: string[][] = [];
  events.subscribe("documentsChanged", ({ documents: open }) => {
    lists.push(open.map((document) => document.id));
    names.push(open.map((document) => document.name));
  });
  const packs: PackStore = {
    list: async () => [template],
    get: async (packId) =>
      packId === "template"
        ? { info: template, data: PackData.parse({ starters: [starter] }), plugin: { id: "template" } }
        : undefined,
  };
  let ids = 0;
  const preferences = createPreferenceStore(createMemoryKeyValueStorage());
  const workspace = createWorkspaceManager({ documents, packs, preferences, events, newId: () => `new-${++ids}` });
  return { documents, events, lists, names, workspace };
}

const json = (document: unknown) => strToU8(JSON.stringify(document));
const iron = Document.parse(exampleDocument);

describe("the workspace manager", () => {
  it("reports no restore problems unless the composition root passes some", async () => {
    await expect(setup().workspace.getRestoreProblems({})).resolves.toEqual([]);
  });

  it("reports the problems of restoring last session's documents", async () => {
    const problems = [{ path: ["doc-9"], message: "Made with a newer Carbonara (document version 99)" }];
    const workspace = createWorkspaceManager({
      documents: createMemoryDocumentStore(),
      packs: { list: async () => [], get: async () => undefined },
      preferences: createPreferenceStore(createMemoryKeyValueStorage()),
      events: createEventBus<Events>(),
      newId: () => "x",
      restoreProblems: () => problems,
    });
    await expect(workspace.getRestoreProblems({})).resolves.toEqual(problems);
  });

  it("remembers preferences, changing only the ones given", async () => {
    const { workspace } = setup();
    await expect(workspace.getPreferences({})).resolves.toEqual({});
    await expect(workspace.setPreferences({ preferences: { tour: { step: 3, finished: true } } })).resolves.toEqual({
      tour: { step: 3, finished: true },
    });
    await expect(workspace.getPreferences({})).resolves.toEqual({ tour: { step: 3, finished: true } });
  });

  it("answers pings", async () => {
    await expect(setup().workspace.ping({})).resolves.toBe("pong");
  });

  it("creates an empty document for a pack", async () => {
    const { workspace, documents, lists } = setup();
    await expect(workspace.createDocument({ name: "Base", packId: "template" })).resolves.toEqual({
      id: "new-1",
      name: "Base",
      packId: "template",
      version: 1,
    });
    expect(documents.get("new-1")?.document).toEqual({
      format: "carbonara",
      version: 1,
      id: "new-1",
      name: "Base",
      pack: { id: "template", version: "1.0.0", hash: "sha256-template" },
      graph: { nodes: {}, edges: {} },
      blueprints: {},
      layout: {},
      settings: {},
    });
    expect(lists).toEqual([["new-1"]]);
  });

  it("creates a document from one of the pack's starter factories", async () => {
    const { workspace, documents } = setup();
    await workspace.createDocument({ name: "My wire", packId: "template", starter: "wire" });
    expect(documents.get("new-1")?.document).toMatchObject({
      name: "My wire",
      pack: { id: "template", version: "1.0.0", hash: "sha256-template" },
      graph: starter.graph,
      layout: starter.layout,
      settings: starter.settings,
    });
  });

  it("refuses starters the pack doesn't have", async () => {
    await expect(
      setup().workspace.createDocument({ name: "Wire", packId: "template", starter: "ghost" }),
    ).rejects.toThrow("Template Works has no starter factory ghost");
  });

  it("refuses packs that aren't installed", async () => {
    await expect(setup().workspace.createDocument({ name: "Base", packId: "ghost" })).rejects.toThrow(
      "Unknown pack ghost",
    );
  });

  it("lists the open documents, like tabs", async () => {
    const { workspace } = setup();
    await workspace.createDocument({ name: "One", packId: "template" });
    await workspace.importDocument({ bytes: json(exampleDocument) });
    await expect(workspace.listDocuments({})).resolves.toEqual([
      { id: "new-1", name: "One", packId: "template", version: 1 },
      { id: "doc-1", name: "Iron", packId: "satisfactory", version: 1 },
    ]);
  });

  it("imports files and announces the new list", async () => {
    const { workspace, documents, lists } = setup();
    await expect(workspace.importDocument({ bytes: json(exampleDocument) })).resolves.toMatchObject({
      ok: true,
      value: { id: "doc-1", name: "Iron" },
    });
    expect(documents.get("doc-1")?.document).toEqual(iron);
    expect(lists).toEqual([["doc-1"]]);
  });

  it("opens a second copy of a file under a new id", async () => {
    const { workspace } = setup();
    await workspace.importDocument({ bytes: json(exampleDocument) });
    await expect(workspace.importDocument({ bytes: json(exampleDocument) })).resolves.toMatchObject({
      ok: true,
      value: { id: "new-1", name: "Iron" },
    });
  });

  it("refuses files that aren't documents, opening nothing", async () => {
    const { workspace, lists } = setup();
    await expect(workspace.importDocument({ bytes: strToU8("hello") })).resolves.toEqual({
      ok: false,
      error: [{ path: [], message: "Not a Carbonara document" }],
    });
    expect(lists).toEqual([]);
  });

  it("exports a document that imports identically", async () => {
    const { workspace, documents } = setup();
    await workspace.importDocument({ bytes: json(exampleDocument) });
    const bytes = await workspace.exportDocument({ documentId: "doc-1" });
    await workspace.closeDocument({ documentId: "doc-1" });
    await workspace.importDocument({ bytes });
    expect(documents.get("doc-1")?.document).toEqual(iron);
  });

  it("closes documents and announces the new list", async () => {
    const { workspace, lists } = setup();
    await workspace.importDocument({ bytes: json(exampleDocument) });
    await workspace.createDocument({ name: "Two", packId: "template" });
    await workspace.closeDocument({ documentId: "doc-1" });
    await expect(workspace.listDocuments({})).resolves.toMatchObject([{ id: "new-1" }]);
    expect(lists.at(-1)).toEqual(["new-1"]);
  });

  it("announces the list again when a document is renamed, but not for other edits", async () => {
    const { workspace, documents, events, names } = setup();
    await workspace.importDocument({ bytes: json(exampleDocument) });
    const moved = { op: "replace" as const, path: ["layout", "root", "ore", "x"], value: 5 };
    events.publish("documentChanged", { documentId: "doc-1", version: 2, patches: [moved] });
    documents.put({ ...iron, name: "Iron works" });
    const renamed = { op: "replace" as const, path: ["name"], value: "Iron works" };
    events.publish("documentChanged", { documentId: "doc-1", version: 3, patches: [renamed] });
    expect(names).toEqual([["Iron"], ["Iron works"]]);
  });

  it("lists closed documents as recent and opens them again", async () => {
    const { workspace, lists } = setup();
    await workspace.importDocument({ bytes: json(exampleDocument) });
    await workspace.closeDocument({ documentId: "doc-1" });
    await expect(workspace.listRecent({})).resolves.toMatchObject([{ id: "doc-1", name: "Iron" }]);

    await expect(workspace.openRecent({ documentId: "doc-1" })).resolves.toMatchObject({
      ok: true,
      value: { id: "doc-1", name: "Iron", version: 1 },
    });
    expect(lists).toEqual([["doc-1"], [], ["doc-1"]]);
    await expect(workspace.listRecent({})).resolves.toEqual([]);
  });

  it("refuses to reopen a document that isn't recent", async () => {
    await expect(setup().workspace.openRecent({ documentId: "ghost" })).resolves.toMatchObject({ ok: false });
  });

  it("reopens a recent document as a copy when one with its id is open", async () => {
    const { workspace } = setup();
    await workspace.importDocument({ bytes: json(exampleDocument) });
    await workspace.closeDocument({ documentId: "doc-1" });
    await workspace.importDocument({ bytes: json(exampleDocument) });
    await expect(workspace.openRecent({ documentId: "doc-1" })).resolves.toMatchObject({ value: { id: "new-1" } });
  });

  it("ignores closing a document that isn't open", async () => {
    const { workspace, lists } = setup();
    await workspace.closeDocument({ documentId: "ghost" });
    expect(lists).toEqual([]);
  });

  it("refuses to export documents that aren't open", async () => {
    await expect(setup().workspace.exportDocument({ documentId: "ghost" })).rejects.toThrow("Unknown document ghost");
  });

  it("round-trips a document through a share link as a copy", async () => {
    const { workspace, documents } = setup();
    await workspace.importDocument({ bytes: json(exampleDocument) });
    const fragment = await workspace.createShareLink({ documentId: "doc-1" });
    await expect(workspace.openShareLink({ fragment })).resolves.toMatchObject({ ok: true, value: { id: "new-1" } });
    expect(documents.get("new-1")?.document).toEqual({ ...iron, id: "new-1" });
  });

  it("refuses broken share links", async () => {
    await expect(setup().workspace.openShareLink({ fragment: "broken" })).resolves.toMatchObject({ ok: false });
  });
});
