import { describe, expect, it } from "vitest";
import { Clipboard } from "../../contracts/clipboard";
import { Document } from "../../contracts/document";
import { exampleDocument } from "../../contracts/document.fixture";
import { applyCommands, type ResolvedCommand } from "./commands";
import { copyNodes, pasteCommands } from "./clipboard";

const document = Document.parse(exampleDocument);

/** Ids like the manager's: unique, and readable in failures. */
function counter() {
  let next = 0;
  return () => `${(++next).toString(16).padStart(6, "0")}-uuid`;
}

function copied(nodeIds: string[], from = document, scope = "root") {
  const result = copyNodes(from, scope, nodeIds);
  if (!result.ok) throw new Error(result.error.map((issue) => issue.message).join());
  return result.value;
}

function pasted(clipboard: Clipboard, options = {}, into = document, scope = "root") {
  const result = pasteCommands(
    into,
    scope,
    clipboard,
    { offset: { x: 0, y: 0 }, connections: false, ...options },
    counter(),
  );
  if (!result.ok) throw new Error(result.error.map((issue) => issue.message).join());
  const applied = applyCommands(into, result.value.commands);
  if (!applied.ok) throw new Error(applied.error.map((issue) => issue.message).join());
  return { ...result.value, document: applied.value.document };
}

describe("copying", () => {
  it("takes the nodes with their positions and the flows among them", () => {
    const clipboard = copied(["ore", "smelt"]);
    expect(clipboard.graph.nodes).toEqual({ ore: document.graph.nodes.ore, smelt: document.graph.nodes.smelt });
    expect(clipboard.graph.edges).toEqual({ e1: document.graph.edges.e1 });
    expect(clipboard.layout).toEqual({ ore: { x: 0, y: 0 }, smelt: { x: 240, y: 0 } });
  });

  it("keeps the flows to nodes it left behind as connections", () => {
    const clipboard = copied(["smelt"]);
    expect(clipboard.graph.edges).toEqual({});
    expect(clipboard.connections).toEqual({ e1: document.graph.edges.e1, e2: document.graph.edges.e2 });
  });

  it("says which pack and graph the nodes come from, and is valid JSON for the system clipboard", () => {
    const clipboard = copied(["ore"]);
    expect(clipboard).toMatchObject({
      format: "carbonara-clipboard",
      version: 1,
      pack: { id: "satisfactory", version: "1.2.0" },
      source: { documentId: "doc-1", graph: "root" },
    });
    expect(Clipboard.parse(JSON.parse(JSON.stringify(clipboard)))).toEqual(clipboard);
  });

  it("puts a node without a position at the origin", () => {
    expect(copied(["split"]).layout).toEqual({ split: { x: 0, y: 0 } });
  });

  it("refuses nodes that don't exist, and unknown graphs", () => {
    expect(copyNodes(document, "root", ["nope"]).ok).toBe(false);
    expect(copyNodes(document, "nowhere", ["ore"]).ok).toBe(false);
  });
});

describe("pasting", () => {
  it("adds the nodes under fresh, readable ids, moved by the offset", () => {
    const result = pasted(copied(["ore", "smelt", "area"]), { offset: { x: 48, y: 96 } });
    expect(result.nodeIds).toHaveLength(3);
    for (const id of result.nodeIds) expect(document.graph.nodes[id]).toBeUndefined();
    const [ore, smelt, area] = result.nodeIds;
    expect(ore).toMatch(/^ore-[0-9a-f]{6}$/);
    expect(result.document.graph.nodes[smelt ?? ""]).toEqual(document.graph.nodes.smelt);
    expect(result.document.layout.root?.[ore ?? ""]).toEqual({ x: 48, y: 96 });
    expect(result.document.layout.root?.[area ?? ""]).toEqual({ x: 28, y: 76, width: 600, height: 300 });
  });

  it("keeps the flows among the pasted nodes, between the new nodes", () => {
    const result = pasted(copied(["ore", "smelt", "split"]));
    const [ore, smelt, split] = result.nodeIds;
    const added = Object.entries(result.document.graph.edges).filter(([id]) => !document.graph.edges[id]);
    expect(added.map(([, edge]) => edge)).toEqual([
      { ...document.graph.edges.e1, from: ore, to: smelt },
      { ...document.graph.edges.e2, from: smelt, to: split },
    ]);
  });

  it("never reuses an id when the same nodes are pasted twice", () => {
    const clipboard = copied(["ore", "smelt"]);
    const first = pasted(clipboard);
    const second = pasted(clipboard, {}, first.document);
    const ids = [...first.nodeIds, ...second.nodeIds];
    expect(new Set(ids).size).toBe(4);
    expect(Object.keys(second.document.graph.nodes)).toHaveLength(Object.keys(document.graph.nodes).length + 4);
  });

  it("picks another id when the generator offers a taken one", () => {
    const clipboard = copied(["ore"]);
    const taken = ["000001", "000001", "000002"];
    const result = pasteCommands(
      {
        ...document,
        graph: { ...document.graph, nodes: { ...document.graph.nodes, "ore-000001": { kind: "junction" } } },
      },
      "root",
      clipboard,
      { offset: { x: 0, y: 0 }, connections: false },
      () => taken.shift() ?? "ffffff",
    );
    expect(result.ok && result.value.nodeIds).toEqual(["ore-000002"]);
  });

  it("with connections, reconnects the pasted nodes to the nodes they were connected to", () => {
    const result = pasted(copied(["smelt"]), { connections: true });
    const [smelt] = result.nodeIds;
    const added = Object.entries(result.document.graph.edges).filter(([id]) => !document.graph.edges[id]);
    expect(added.map(([, edge]) => edge)).toEqual([
      { ...document.graph.edges.e1, to: smelt },
      { ...document.graph.edges.e2, from: smelt },
    ]);
  });

  it("leaves connections out in another document, in another graph, or once the other node is gone", () => {
    const clipboard = copied(["smelt"]);
    const elsewhere = { ...document, id: "doc-2" };
    expect(edgesAdded(pasted(clipboard, { connections: true }, elsewhere).document)).toBe(0);
    expect(edgesAdded(pasted(clipboard, { connections: false }).document)).toBe(0);
    const withoutOre = applyCommands(document, [{ type: "removeNodes", graph: "root", ids: ["ore"] }]);
    if (!withoutOre.ok) throw new Error("setup");
    const reconnected = pasted(clipboard, { connections: true }, withoutOre.value.document);
    expect(edgesAdded(reconnected.document, withoutOre.value.document)).toBe(1);
  });

  it("leaves out ports outside subgraphs and subgraphs the factory doesn't have, with their flows", () => {
    const inside = copied(["in", "make"], document, "rods");
    const intoRoot = pasted(inside);
    expect(intoRoot.nodeIds).toHaveLength(1);
    expect(intoRoot.leftOut).toEqual(["1 subgraph port (ports only exist inside subgraphs)"]);
    expect(edgesAdded(intoRoot.document)).toBe(0);

    // A copy from before copies carried their blueprints.
    const withInstance = { ...copied(["split", "rods"]), blueprints: {} };
    const empty = { ...document, id: "doc-2", blueprints: {} };
    const elsewhere = pasted(withInstance, {}, empty);
    expect(elsewhere.nodeIds).toHaveLength(1);
    expect(elsewhere.leftOut).toEqual(["1 subgraph this factory doesn't have"]);
  });

  it("leaves out a subgraph pasted into itself", () => {
    const result = pasted(copied(["rods"]), {}, document, "rods");
    expect(result.nodeIds).toEqual([]);
    expect(result.leftOut).toEqual(["1 subgraph that would contain itself"]);
  });

  it("keeps a subgraph's port flows when the subgraph is there", () => {
    const result = pasted(copied(["split", "rods"]));
    const [split, rods] = result.nodeIds;
    const added = Object.entries(result.document.graph.edges).filter(([id]) => !document.graph.edges[id]);
    expect(added.map(([, edge]) => edge)).toEqual([{ ...document.graph.edges.e4, from: split, to: rods }]);
  });

  it("copies and pastes nodes named like what plain objects inherit, and knows they're not there otherwise", () => {
    const named = Document.parse({
      ...exampleDocument,
      graph: {
        nodes: {
          constructor: { kind: "recipe", recipe: "iron-ingot" },
          toString: { kind: "source", item: "iron-ore" },
        },
        edges: { valueOf: { from: "toString", to: "constructor", item: "iron-ore" } },
      },
      layout: { root: { constructor: { x: 240, y: 0 } } },
    });
    expect(copyNodes(document, "root", ["hasOwnProperty"]).ok).toBe(false);
    const clipboard = copied(["constructor", "toString"], named);
    expect(clipboard.layout).toEqual({ constructor: { x: 240, y: 0 }, toString: { x: 0, y: 0 } });
    const result = pasted(clipboard, { connections: true }, named);
    expect(result.nodeIds).toEqual([
      expect.stringMatching(/^constructor-[0-9a-f]{6}$/),
      expect.stringMatching(/^toString-[0-9a-f]{6}$/),
    ]);
    expect(Object.keys(result.document.graph.edges)).toHaveLength(2);
  });

  it("refuses an unknown graph", () => {
    const result = pasteCommands(
      document,
      "nowhere",
      copied(["ore"]),
      { offset: { x: 0, y: 0 }, connections: false },
      counter(),
    );
    expect(result.ok).toBe(false);
  });
});

describe("blueprints travelling with a copy", () => {
  /** The rods placed inside a hall, which the factory places too. */
  const halls = Document.parse({
    ...exampleDocument,
    graph: {
      ...exampleDocument.graph,
      nodes: { ...exampleDocument.graph.nodes, hall: { kind: "instance", blueprint: "hall" } },
    },
    blueprints: {
      ...exampleDocument.blueprints,
      hall: { name: "Hall", graph: { nodes: { inner: { kind: "instance", blueprint: "rods" } }, edges: {} } },
    },
    layout: { ...exampleDocument.layout, hall: { inner: { x: 24, y: 48 } } },
  });
  const empty = Document.parse({ ...exampleDocument, id: "doc-2", graph: { nodes: {}, edges: {} }, blueprints: {} });
  const addedBlueprints = (paste: { commands: ResolvedCommand[] }) =>
    paste.commands.flatMap((command) => (command.type === "addBlueprint" ? [command.id] : []));

  it("a copy carries the blueprints its instances place, directly or deeper, with their layouts", () => {
    expect(copied(["hall"], halls).blueprints).toEqual({
      hall: { ...halls.blueprints.hall, layout: { inner: { x: 24, y: 48 } } },
      rods: { ...halls.blueprints.rods, layout: { in: { x: 0, y: 0 } } },
    });
    expect(copied(["ore", "smelt"], halls).blueprints).toEqual({});
  });

  it("pasting into a factory without them adds them first, inner ones first, in the same step", () => {
    const result = pasted(copied(["split", "rods", "hall"], halls), {}, empty);
    expect(result.commands.map((command) => command.type).slice(0, 2)).toEqual(["addBlueprint", "addBlueprint"]);
    expect(addedBlueprints(result)).toEqual(["rods", "hall"]);
    expect(result.leftOut).toEqual([]);
    expect(result.document.blueprints).toEqual({ rods: halls.blueprints.rods, hall: halls.blueprints.hall });
    expect(result.document.layout.hall).toEqual({ inner: { x: 24, y: 48 } });
    // The flow into the rods' port comes along: the port is there now.
    const [split, rods] = result.nodeIds;
    expect(Object.values(result.document.graph.edges)).toEqual([{ ...halls.graph.edges.e4, from: split, to: rods }]);
  });

  it("reuses the blueprints the factory has alike, so pasting again adds none", () => {
    expect(addedBlueprints(pasted(copied(["hall"], halls), {}, halls))).toEqual([]);
    const once = pasted(copied(["hall"], halls), {}, empty);
    const twice = pasted(copied(["hall"], halls), {}, once.document);
    expect(addedBlueprints(twice)).toEqual([]);
    expect(Object.keys(twice.document.blueprints)).toEqual(["rods", "hall"]);
  });

  it("adds a copy under a fresh id and name when the factory has another blueprint under the same id", () => {
    const other = Document.parse({
      ...exampleDocument,
      id: "doc-2",
      blueprints: { rods: { ...exampleDocument.blueprints.rods, graph: { nodes: {}, edges: {} } } },
    });
    const result = pasted(copied(["rods"], halls), {}, other);
    const [id] = addedBlueprints(result);
    expect(id).toMatch(/^rods-[0-9a-f]{6}$/);
    expect(result.document.blueprints[id ?? ""]).toEqual({ ...halls.blueprints.rods, name: "Iron rods 2" });
    expect(result.document.blueprints.rods).toEqual(other.blueprints.rods);
    const [instance] = result.nodeIds;
    expect(result.document.graph.nodes[instance ?? ""]).toEqual({ kind: "instance", blueprint: id });
  });

  it("finds an alike blueprint under another id, through the blueprints it places", () => {
    const renamed = pasted(copied(["hall"], halls), {}, empty).document;
    const moved = Document.parse({
      ...renamed,
      blueprints: {
        r: renamed.blueprints.rods,
        h: { name: "Hall", graph: { nodes: { inner: { kind: "instance", blueprint: "r" } }, edges: {} } },
      },
      layout: {},
    });
    const result = pasted(copied(["hall"], halls), {}, moved);
    expect(addedBlueprints(result)).toEqual([]);
    expect(result.document.graph.nodes[result.nodeIds[0] ?? ""]).toEqual({ kind: "instance", blueprint: "h" });
  });

  it("in the factory it came from, places the blueprint as it is now, even when it was edited since", () => {
    const clipboard = copied(["rods"], halls);
    const edited = applyCommands(halls, [{ type: "renameBlueprint", blueprint: "rods", name: "Rods mk2" }]);
    if (!edited.ok) throw new Error("setup");
    const result = pasted(clipboard, {}, edited.value.document);
    expect(addedBlueprints(result)).toEqual([]);
    expect(result.document.graph.nodes[result.nodeIds[0] ?? ""]).toEqual({ kind: "instance", blueprint: "rods" });
  });

  it("adds no blueprint for an instance it leaves out", () => {
    const result = pasted(copied(["hall"], halls), {}, halls, "rods");
    expect(result.leftOut).toEqual(["1 subgraph that would contain itself"]);
    expect(addedBlueprints(result)).toEqual([]);
  });
});

function edgesAdded(after: Document, before: Document = document): number {
  return Object.keys(after.graph.edges).length - Object.keys(before.graph.edges).length;
}
