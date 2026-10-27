import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import { createMemoryDocumentStore } from "../access/documents/memory";
import { createMemoryProposalStore } from "../access/proposals/memory";
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
  const proposals = createMemoryProposalStore();
  let ids = 0;
  const editing = createEditingManager({
    documents,
    events,
    newId: () => `id-${++ids}`,
    layout: new ELK(),
    proposals,
  });
  /** Calls `apply` with arguments as the dispatcher passes them: validated, defaults filled in. */
  const apply = (commands: CommandInput[], label?: string) =>
    editing.apply({
      documentId: "doc-1",
      commands: commands.map((command) => Command.parse(command)),
      ...(label === undefined ? {} : { label }),
    });
  const current = async () => (await editing.getDocument({ documentId: "doc-1" })).document;
  return { documents, events, changes, editing, apply, current, proposals };
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

  it("chooses the ids of a collapse's blueprint and instance, and one undo expands it again", async () => {
    const { apply, current, editing } = setup();
    await apply([{ type: "collapse", ids: ["smelt", "split"], name: "Smelting" }]);
    const collapsed = await current();
    expect(collapsed.blueprints["id-1"]?.name).toBe("Smelting");
    expect(collapsed.graph.nodes["id-2"]).toEqual({ kind: "instance", blueprint: "id-1" });
    await editing.undo({ documentId: "doc-1" });
    expect(await current()).toEqual(original);
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

describe("arranging", () => {
  const shapes = {
    ore: { width: 264, height: 72, ports: [{ side: "out" as const, item: "iron-ore", x: 264, y: 36 }] },
    smelt: {
      width: 312,
      height: 156,
      ports: [
        { side: "in" as const, item: "iron-ore", x: 0, y: 108 },
        { side: "out" as const, item: "iron-ingot", x: 312, y: 136 },
      ],
    },
  };

  it("moves the nodes in one step labelled Arrange, keeping their other layout fields", async () => {
    const { editing, changes, current } = setup();
    const result = await editing.arrange({ documentId: "doc-1", graph: "root", direction: "right", shapes });
    expect(result).toMatchObject({ ok: true, value: { version: 2 } });
    const layout = (await current()).layout["root"] ?? {};
    // The ore feeds the smelter, so it sits to its left; their frame fits around both.
    expect(layout["ore"]?.x ?? 0).toBeLessThan(layout["smelt"]?.x ?? 0);
    const area = layout["area"] ?? { x: 0, y: 0 };
    expect(area.x).toBeLessThan(layout["ore"]?.x ?? 0);
    expect(area.x + (area.width ?? 0)).toBeGreaterThan((layout["smelt"]?.x ?? 0) + 312);
    expect(changes.map((change) => change.label)).toEqual(["Arrange"]);
    await editing.undo({ documentId: "doc-1" });
    expect(await current()).toEqual(original);
  });

  it("turns the flows of the nodes it arranges top to bottom down, and back when arranging left to right", async () => {
    const { editing, current } = setup();
    const nodeIds = ["ore", "smelt"];
    await editing.arrange({ documentId: "doc-1", graph: "root", direction: "down", shapes, nodeIds });
    const down = (await current()).layout["root"] ?? {};
    expect(down["ore"]?.flow).toBe("down");
    expect(down["smelt"]?.flow).toBe("down");
    expect(down["area"]?.flow).toBeUndefined();

    await editing.arrange({ documentId: "doc-1", graph: "root", direction: "right", shapes, nodeIds });
    const right = (await current()).layout["root"] ?? {};
    expect(right["ore"]).not.toHaveProperty("flow");
    expect(right["smelt"]).not.toHaveProperty("flow");
  });

  it("arranges only the nodes asked for", async () => {
    const { editing, current } = setup();
    await editing.arrange({
      documentId: "doc-1",
      graph: "root",
      direction: "right",
      shapes,
      nodeIds: ["split", "out"],
    });
    const layout = (await current()).layout["root"] ?? {};
    expect(layout["ore"]).toEqual({ x: 0, y: 0 });
    expect(layout["smelt"]).toEqual({ x: 240, y: 0 });
    expect(layout).toHaveProperty("split");
  });

  it("refuses unknown documents and graphs", async () => {
    const { editing, changes } = setup();
    await expect(editing.arrange({ documentId: "ghost", graph: "root", direction: "right", shapes })).resolves.toEqual({
      ok: false,
      error: [{ path: ["documentId"], message: "Unknown document ghost" }],
    });
    await expect(
      editing.arrange({ documentId: "doc-1", graph: "nope", direction: "down", shapes: {} }),
    ).resolves.toEqual({
      ok: false,
      error: [{ path: ["graph"], message: "Unknown graph nope" }],
    });
    expect(changes).toEqual([]);
  });
});

describe("copy and paste", () => {
  it("copies nodes and pastes them as one undo step under fresh ids", async () => {
    const { editing, current, changes } = setup();
    const copied = await editing.copy({ documentId: "doc-1", graph: "root", nodeIds: ["ore", "smelt"] });
    if (!copied.ok) throw new Error("copy failed");
    const pasted = await editing.paste({
      documentId: "doc-1",
      graph: "root",
      clipboard: copied.value,
      offset: { x: 24, y: 48 },
      connections: false,
    });
    if (!pasted.ok) throw new Error("paste failed");
    expect(pasted.value.nodeIds).toEqual(["ore-id1", "smelt-id2"]);
    expect(pasted.value.leftOut).toEqual([]);
    expect(pasted.value.document.version).toBe(2);
    expect((await current()).layout.root?.["ore-id1"]).toEqual({ x: 24, y: 48 });
    expect(changes.map((change) => change.label)).toEqual(["Paste 2 nodes"]);

    await editing.undo({ documentId: "doc-1" });
    expect(await current()).toEqual(original);
  });

  it("names the step as asked, and says what it left out", async () => {
    const { editing, changes } = setup();
    const copied = await editing.copy({ documentId: "doc-1", graph: "rods", nodeIds: ["in", "make"] });
    if (!copied.ok) throw new Error("copy failed");
    const pasted = await editing.paste({
      documentId: "doc-1",
      graph: "root",
      clipboard: copied.value,
      offset: { x: 0, y: 0 },
      connections: false,
      label: "Duplicate 2 nodes",
    });
    expect(pasted.ok && pasted.value.leftOut).toEqual(["1 subgraph port (ports only exist inside subgraphs)"]);
    expect(changes.map((change) => change.label)).toEqual(["Duplicate 2 nodes"]);
  });

  it("refuses unknown documents, graphs and nodes", async () => {
    const { editing } = setup();
    expect((await editing.copy({ documentId: "ghost", graph: "root", nodeIds: ["ore"] })).ok).toBe(false);
    expect((await editing.copy({ documentId: "doc-1", graph: "root", nodeIds: ["nope"] })).ok).toBe(false);
    const copied = await editing.copy({ documentId: "doc-1", graph: "root", nodeIds: ["ore"] });
    if (!copied.ok) throw new Error("copy failed");
    const into = { clipboard: copied.value, offset: { x: 0, y: 0 }, connections: false };
    expect((await editing.paste({ documentId: "ghost", graph: "root", ...into })).ok).toBe(false);
    expect((await editing.paste({ documentId: "doc-1", graph: "nope", ...into })).ok).toBe(false);
  });
});

describe("accepting a proposal", () => {
  const planned = {
    documentId: "doc-1",
    targets: [{ item: "iron-plate", perSecond: 1 }],
    commands: [
      {
        type: "addNode" as const,
        graph: "root",
        id: "plan-ore",
        node: { kind: "source" as const, item: "iron-ore" },
        position: { x: 600, y: 0 },
      },
      {
        type: "addNode" as const,
        graph: "root",
        id: "plan-out",
        node: { kind: "sink" as const, item: "iron-ore" },
        position: { x: 960, y: 0 },
      },
      {
        type: "connect" as const,
        graph: "root",
        id: "plan-flow",
        edge: { from: "plan-ore", to: "plan-out", item: "iron-ore" },
      },
    ],
    results: { nodes: {}, edges: {} },
    summary: { buildings: {}, raw: {}, byproducts: {}, shortfalls: {}, powerMW: 0 },
  };

  it("adds it as one undo step where its ghost was left, and settles it as accepted", async () => {
    const { editing, proposals, events, changes, current } = setup();
    const settled: string[] = [];
    events.subscribe("proposalChanged", ({ proposal, status }) => settled.push(`${proposal.id} ${status}`));
    const { id } = proposals.add(planned);
    const result = await editing.applyProposal({ proposalId: id, label: "Plan iron", offset: { x: 24, y: -48 } });
    expect(result).toMatchObject({ ok: true, value: { id: "doc-1", version: 2 } });
    const document = await current();
    expect(document.graph.edges["plan-flow"]).toEqual({ from: "plan-ore", to: "plan-out", item: "iron-ore" });
    expect(document.layout["root"]?.["plan-ore"]).toEqual({ x: 624, y: -48 });
    expect(changes.map((change) => change.label)).toEqual(["Plan iron"]);
    expect(proposals.get(id)?.status).toBe("accepted");
    expect(settled).toEqual([`${id} accepted`]);

    await editing.undo({ documentId: "doc-1" });
    expect((await current()).graph).toEqual(original.graph);
  });

  it("refuses proposals that aren't pending, saying why", async () => {
    const { editing, proposals, changes } = setup();
    const reasons: Record<string, RegExp> = {
      accepted: /is accepted already/,
      discarded: /The person discarded proposal proposal-\d+/,
      replaced: /A newer plan .* replaced proposal/,
    };
    for (const [status, reason] of Object.entries(reasons)) {
      const { id } = proposals.add(planned);
      proposals.settle(id, status as "accepted" | "discarded" | "replaced");
      expect(await editing.applyProposal({ proposalId: id, label: "Plan", offset: { x: 0, y: 0 } })).toMatchObject({
        ok: false,
        error: [{ path: ["proposalId"], message: expect.stringMatching(reason) }],
      });
    }
    expect(await editing.applyProposal({ proposalId: "proposal-99", label: "Plan", offset: { x: 0, y: 0 } })).toEqual({
      ok: false,
      error: [{ path: ["proposalId"], message: "Unknown proposal proposal-99" }],
    });
    expect(changes).toEqual([]);
  });

  it("keeps a proposal pending when its commands no longer fit the document", async () => {
    const { editing, proposals, apply } = setup();
    const { id } = proposals.add(planned);
    await apply([{ type: "addNode", id: "plan-ore", node: { kind: "junction" }, position: { x: 0, y: 0 } }]);
    expect(await editing.applyProposal({ proposalId: id, label: "Plan", offset: { x: 0, y: 0 } })).toMatchObject({
      ok: false,
    });
    expect(proposals.get(id)?.status).toBe("pending");
  });
});
