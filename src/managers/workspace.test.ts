import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { createMemoryDocumentStore } from "../access/documents/memory";
import type { PackStore } from "../contracts/access";
import { Document } from "../contracts/document";
import { exampleDocument } from "../contracts/document.fixture";
import type { Events, PackInfo } from "../contracts/managers";
import { PackManifest } from "../contracts/pack";
import { createEventBus } from "../utilities/events";
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

function setup() {
  const documents = createMemoryDocumentStore();
  const events = createEventBus<Events>();
  const lists: string[][] = [];
  events.subscribe("documentsChanged", ({ documents: open }) => lists.push(open.map((document) => document.id)));
  const packs: PackStore = { list: async () => [template], get: async () => undefined };
  let ids = 0;
  const workspace = createWorkspaceManager({ documents, packs, events, newId: () => `new-${++ids}` });
  return { documents, lists, workspace };
}

const json = (document: unknown) => strToU8(JSON.stringify(document));
const iron = Document.parse(exampleDocument);

describe("the workspace manager", () => {
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
