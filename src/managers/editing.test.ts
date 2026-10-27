import { describe, expect, it } from "vitest";
import { createMemoryDocumentStore } from "../access/documents/memory";
import { Command, type CommandInput } from "../contracts/commands";
import { Document } from "../contracts/document";
import { exampleDocument } from "../contracts/document.fixture";
import type { Events } from "../contracts/managers";
import { createEventBus } from "../utilities/events";
import { createEditingManager } from "./editing";

const original = Document.parse(exampleDocument);

function setup() {
  const documents = createMemoryDocumentStore();
  documents.put(original);
  const events = createEventBus<Events>();
  const changes: Events["documentChanged"][] = [];
  events.subscribe("documentChanged", (change) => changes.push(change));
  let ids = 0;
  const editing = createEditingManager({ documents, events, newId: () => `id-${++ids}` });
  /** Calls `apply` with arguments as the dispatcher passes them: validated, defaults filled in. */
  const apply = (commands: CommandInput[], label?: string) =>
    editing.apply({
      documentId: "doc-1",
      commands: commands.map((command) => Command.parse(command)),
      ...(label === undefined ? {} : { label }),
    });
  const current = async () => (await editing.getDocument({ documentId: "doc-1" })).document;
  return { documents, events, changes, editing, apply, current };
}

const addJunction: CommandInput = { type: "addNode", node: { kind: "junction" }, position: { x: 1, y: 2 } };
const moveOre: CommandInput = { type: "moveNodes", positions: { ore: { x: 9, y: 9 } } };

describe("the editing manager", () => {
  it("returns open documents with their version", async () => {
    const { editing } = setup();
    await expect(editing.getDocument({ documentId: "doc-1" })).resolves.toEqual({ document: original, version: 1 });
    await expect(editing.getDocument({ documentId: "ghost" })).rejects.toThrow("Unknown document ghost");
  });

  it("applies commands, choosing ids for new nodes, and saves the document", async () => {
    const { apply, current, documents } = setup();
    await expect(apply([addJunction])).resolves.toEqual({
      ok: true,
      value: { id: "doc-1", name: "Iron", packId: "satisfactory", version: 2 },
    });
    expect((await current()).graph.nodes["id-1"]).toEqual({ kind: "junction" });
    expect(documents.get("doc-1")?.version).toBe(2);
  });

  it("keeps the ids callers choose", async () => {
    const { apply, current } = setup();
    await apply([{ ...addJunction, id: "bus" }]);
    expect((await current()).graph.nodes).toHaveProperty("bus");
  });

  it("publishes each change with its patches, version and label", async () => {
    const { apply, changes } = setup();
    await apply([moveOre], "Tidy up");
    expect(changes).toEqual([
      {
        documentId: "doc-1",
        version: 2,
        label: "Tidy up",
        patches: [{ op: "replace", path: ["layout", "root", "ore"], value: { x: 9, y: 9 } }],
      },
    ]);
  });

  it("names the change after its commands when the caller gives no label", async () => {
    const { apply, changes } = setup();
    await apply([moveOre]);
    expect(changes[0]?.label).toBe("Move nodes");
  });

  it("rejects invalid edits without changing or publishing anything", async () => {
    const { apply, changes, current } = setup();
    const result = await apply([moveOre, { type: "removeNodes", ids: ["ghost"] }]);
    expect(result).toEqual({ ok: false, error: [{ path: ["commands", 1, "ids", 0], message: "Unknown node ghost" }] });
    expect(await current()).toEqual(original);
    expect(changes).toEqual([]);
  });

  it("rejects edits to unknown documents", async () => {
    const { editing } = setup();
    await expect(editing.apply({ documentId: "ghost", commands: [Command.parse(moveOre)] })).resolves.toEqual({
      ok: false,
      error: [{ path: ["documentId"], message: "Unknown document ghost" }],
    });
  });

  it("undoes a whole batch as one step and publishes the inverse patches", async () => {
    const { apply, editing, changes, current } = setup();
    await apply([addJunction, moveOre]);
    await expect(editing.undo({ documentId: "doc-1" })).resolves.toMatchObject({ version: 3 });
    expect(await current()).toEqual(original);
    expect(changes[1]).toMatchObject({ version: 3, label: "Undo Edit" });
  });

  it("redoes what was undone", async () => {
    const { apply, editing, changes, current } = setup();
    await apply([addJunction]);
    const edited = await current();
    await editing.undo({ documentId: "doc-1" });
    await editing.redo({ documentId: "doc-1" });
    expect(await current()).toEqual(edited);
    expect(changes.map((change) => change.label)).toEqual(["Add node", "Undo Add node", "Redo Add node"]);
  });

  it("undoes several steps in reverse order", async () => {
    const { apply, editing, current } = setup();
    await apply([addJunction]);
    const afterFirst = await current();
    await apply([moveOre]);
    await editing.undo({ documentId: "doc-1" });
    expect(await current()).toEqual(afterFirst);
    await editing.undo({ documentId: "doc-1" });
    expect(await current()).toEqual(original);
  });

  it("forgets what could be redone once something new is edited", async () => {
    const { apply, editing, current } = setup();
    await apply([addJunction]);
    await editing.undo({ documentId: "doc-1" });
    await apply([moveOre]);
    const edited = await current();
    await editing.redo({ documentId: "doc-1" });
    expect(await current()).toEqual(edited);
  });

  it("changes nothing when there is nothing to undo or redo", async () => {
    const { editing, changes } = setup();
    await expect(editing.undo({ documentId: "doc-1" })).resolves.toMatchObject({ version: 1 });
    await expect(editing.redo({ documentId: "doc-1" })).resolves.toMatchObject({ version: 1 });
    expect(changes).toEqual([]);
  });

  it("keeps a history per document", async () => {
    const { apply, editing, documents, current } = setup();
    documents.put({ ...original, id: "doc-2" });
    await apply([addJunction]);
    await editing.undo({ documentId: "doc-2" });
    expect((await current()).graph.nodes).toHaveProperty("id-1");
  });

  it("forgets the history of documents that were closed", async () => {
    const { apply, editing, documents, events, current } = setup();
    await apply([addJunction]);
    documents.remove("doc-1");
    events.publish("documentsChanged", { documents: [] });
    documents.put(original);
    await editing.undo({ documentId: "doc-1" });
    expect(await current()).toEqual(original);
  });
});
