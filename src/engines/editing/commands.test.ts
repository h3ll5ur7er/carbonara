import { describe, expect, it } from "vitest";
import { Document } from "../../contracts/document";
import { exampleDocument } from "../../contracts/document.fixture";
import { applyCommands, applyPatches, describeCommands, type ResolvedCommand } from "./commands";

const document = Document.parse(exampleDocument);

function edit(...commands: ResolvedCommand[]) {
  const result = applyCommands(document, commands);
  if (!result.ok) throw new Error(`Expected the edit to succeed: ${JSON.stringify(result.error)}`);
  return result.value;
}

function rejection(...commands: ResolvedCommand[]) {
  const result = applyCommands(document, commands);
  if (result.ok) throw new Error("Expected the edit to be rejected");
  return result.error;
}

describe("adding nodes", () => {
  it("adds the node and its position", () => {
    const { document: next } = edit({
      type: "addNode",
      graph: "root",
      id: "bus",
      node: { kind: "junction" },
      position: { x: 5, y: 6 },
    });
    expect(next.graph.nodes["bus"]).toEqual({ kind: "junction" });
    expect(next.layout["root"]?.["bus"]).toEqual({ x: 5, y: 6 });
  });

  it("adds into a blueprint's graph and layout", () => {
    const { document: next } = edit({
      type: "addNode",
      graph: "rods",
      id: "extra",
      node: { kind: "note", text: "hi" },
      position: { x: 1, y: 2 },
    });
    expect(next.blueprints["rods"]?.graph.nodes["extra"]).toEqual({ kind: "note", text: "hi" });
    expect(next.layout["rods"]?.["extra"]).toEqual({ x: 1, y: 2 });
  });

  it("starts a layout for a graph that has none yet", () => {
    const withoutLayout = Document.parse({ ...exampleDocument, layout: {} });
    const result = applyCommands(withoutLayout, [
      { type: "addNode", graph: "root", id: "j", node: { kind: "junction" }, position: { x: 0, y: 0 } },
    ]);
    expect(result.ok && result.value.document.layout).toEqual({ root: { j: { x: 0, y: 0 } } });
  });

  it("rejects an id that is taken", () => {
    expect(
      rejection({ type: "addNode", graph: "root", id: "ore", node: { kind: "junction" }, position: { x: 0, y: 0 } }),
    ).toEqual([{ path: ["commands", 0, "id"], message: "Node ore already exists" }]);
  });

  it("rejects a graph that doesn't exist", () => {
    expect(
      rejection({ type: "addNode", graph: "nope", id: "j", node: { kind: "junction" }, position: { x: 0, y: 0 } }),
    ).toEqual([{ path: ["commands", 0, "graph"], message: "Unknown graph nope" }]);
  });

  it("rejects ports outside of blueprints", () => {
    expect(
      rejection({
        type: "addNode",
        graph: "root",
        id: "p",
        node: { kind: "port", direction: "in", item: "iron-ore" },
        position: { x: 0, y: 0 },
      }),
    ).toEqual([{ path: ["commands", 0, "node", "kind"], message: "Ports only exist inside blueprints" }]);
  });

  it("rejects instances of unknown blueprints", () => {
    expect(
      rejection({
        type: "addNode",
        graph: "root",
        id: "i",
        node: { kind: "instance", blueprint: "ghost" },
        position: { x: 0, y: 0 },
      }),
    ).toEqual([{ path: ["commands", 0, "node", "blueprint"], message: "Unknown blueprint ghost" }]);
  });

  it("rejects placing a blueprint inside itself", () => {
    expect(
      rejection({
        type: "addNode",
        graph: "rods",
        id: "i",
        node: { kind: "instance", blueprint: "rods" },
        position: { x: 0, y: 0 },
      }),
    ).toEqual([{ path: ["commands", 0, "node", "blueprint"], message: "Blueprint rods can't contain itself" }]);
  });
});

describe("removing nodes", () => {
  it("removes the nodes, their edges and their positions", () => {
    const { document: next } = edit({ type: "removeNodes", graph: "root", ids: ["smelt"] });
    expect(next.graph.nodes).not.toHaveProperty("smelt");
    expect(Object.keys(next.graph.edges)).toEqual(["e3", "e4"]);
    expect(next.layout["root"]).not.toHaveProperty("smelt");
  });

  it("removes the edges that reach a removed port through the blueprint's instances", () => {
    const { document: next } = edit({ type: "removeNodes", graph: "rods", ids: ["in"] });
    expect(next.blueprints["rods"]?.graph.edges).not.toHaveProperty("a");
    expect(next.graph.edges).not.toHaveProperty("e4");
    expect(next.layout["rods"]).not.toHaveProperty("in");
  });

  it("rejects unknown nodes", () => {
    expect(rejection({ type: "removeNodes", graph: "root", ids: ["ore", "ghost"] })).toEqual([
      { path: ["commands", 0, "ids", 1], message: "Unknown node ghost" },
    ]);
  });
});

describe("connecting nodes", () => {
  it("adds the edge", () => {
    const { document: next } = edit({
      type: "connect",
      graph: "root",
      id: "e5",
      edge: { from: "split", to: "smelt", item: "iron-ingot" },
    });
    expect(next.graph.edges["e5"]).toEqual({ from: "split", to: "smelt", item: "iron-ingot" });
  });

  it("rejects edges to missing nodes", () => {
    expect(
      rejection({ type: "connect", graph: "root", id: "e5", edge: { from: "ore", to: "ghost", item: "iron-ore" } }),
    ).toEqual([{ path: ["commands", 0, "edge", "to"], message: "Unknown node ghost" }]);
  });

  it("rejects an id that is taken", () => {
    expect(
      rejection({ type: "connect", graph: "root", id: "e1", edge: { from: "ore", to: "smelt", item: "iron-ore" } }),
    ).toEqual([{ path: ["commands", 0, "id"], message: "Edge e1 already exists" }]);
  });

  it("connects an instance through one of its blueprint's ports", () => {
    const { document: next } = edit({
      type: "connect",
      graph: "root",
      id: "e5",
      edge: { from: "rods", fromPort: "out", to: "out", item: "iron-rod" },
    });
    expect(next.graph.edges["e5"]?.fromPort).toBe("out");
  });

  it("rejects ports of the wrong direction", () => {
    expect(
      rejection({
        type: "connect",
        graph: "root",
        id: "e5",
        edge: { from: "rods", fromPort: "in", to: "out", item: "iron-rod" },
      }),
    ).toEqual([{ path: ["commands", 0, "edge", "fromPort"], message: "rods has no out port in" }]);
  });

  it("rejects ports on nodes that aren't instances", () => {
    expect(
      rejection({
        type: "connect",
        graph: "root",
        id: "e5",
        edge: { from: "ore", to: "smelt", toPort: "in", item: "iron-ore" },
      }),
    ).toEqual([{ path: ["commands", 0, "edge", "toPort"], message: "smelt has no in port in" }]);
  });
});

describe("disconnecting nodes", () => {
  it("removes the edges", () => {
    const { document: next } = edit({ type: "disconnect", graph: "root", ids: ["e1", "e2"] });
    expect(Object.keys(next.graph.edges)).toEqual(["e3", "e4"]);
  });

  it("rejects unknown edges", () => {
    expect(rejection({ type: "disconnect", graph: "root", ids: ["ghost"] })).toEqual([
      { path: ["commands", 0, "ids", 0], message: "Unknown edge ghost" },
    ]);
  });
});

describe("moving nodes", () => {
  it("changes only the layout", () => {
    const { document: next, patches } = edit({
      type: "moveNodes",
      graph: "root",
      positions: { ore: { x: 10, y: 20 }, split: { x: 1, y: 1 } },
    });
    expect(next.layout["root"]?.["ore"]).toEqual({ x: 10, y: 20 });
    expect(next.layout["root"]?.["split"]).toEqual({ x: 1, y: 1 });
    expect(patches.every((patch) => patch.path[0] === "layout")).toBe(true);
  });

  it("rejects unknown nodes", () => {
    expect(rejection({ type: "moveNodes", graph: "root", positions: { ghost: { x: 0, y: 0 } } })).toEqual([
      { path: ["commands", 0, "positions", "ghost"], message: "Unknown node ghost" },
    ]);
  });
});

describe("setting fields and pins", () => {
  it("merges fields into a recipe node", () => {
    const { document: next, patches } = edit({
      type: "setNodeFields",
      graph: "root",
      id: "smelt",
      fields: { mode: "x" },
    });
    expect(next.graph.nodes["smelt"]).toMatchObject({ fields: { clock: 150, mode: "x" } });
    expect(patches).toEqual([{ op: "add", path: ["graph", "nodes", "smelt", "fields", "mode"], value: "x" }]);
  });

  it("starts the fields of a recipe node that has none", () => {
    const { document: next } = edit({ type: "setNodeFields", graph: "rods", id: "make", fields: { clock: 50 } });
    expect(next.blueprints["rods"]?.graph.nodes["make"]).toMatchObject({ fields: { clock: 50 } });
  });

  it("sets and clears pins", () => {
    const pinned = edit({ type: "setPin", graph: "rods", id: "make", pin: { type: "machines", count: 2 } }).document;
    expect(pinned.blueprints["rods"]?.graph.nodes["make"]).toMatchObject({ pin: { type: "machines", count: 2 } });
    const { document: cleared } = edit({ type: "setPin", graph: "root", id: "smelt", pin: null });
    expect(cleared.graph.nodes["smelt"]).not.toHaveProperty("pin");
  });

  it.each<ResolvedCommand>([
    { type: "setNodeFields", graph: "root", id: "ore", fields: { clock: 1 } },
    { type: "setPin", graph: "root", id: "ore", pin: null },
  ])("rejects $type on nodes other than recipes", (command) => {
    expect(rejection(command)).toEqual([{ path: ["commands", 0, "id"], message: "ore is not a recipe node" }]);
  });

  it("rejects unknown nodes", () => {
    expect(rejection({ type: "setPin", graph: "root", id: "ghost", pin: null })).toEqual([
      { path: ["commands", 0, "id"], message: "Unknown node ghost" },
    ]);
  });
});

describe("a batch of commands", () => {
  it("sees the effects of earlier commands", () => {
    const { document: next } = edit(
      { type: "addNode", graph: "root", id: "j", node: { kind: "junction" }, position: { x: 0, y: 0 } },
      { type: "connect", graph: "root", id: "e5", edge: { from: "j", to: "out", item: "iron-ingot" } },
    );
    expect(next.graph.edges["e5"]).toMatchObject({ from: "j" });
  });

  it("is rejected as a whole, naming the command that failed", () => {
    expect(
      rejection(
        { type: "removeNodes", graph: "root", ids: ["ore"] },
        { type: "connect", graph: "root", id: "e5", edge: { from: "ore", to: "smelt", item: "iron-ore" } },
      ),
    ).toEqual([{ path: ["commands", 1, "edge", "from"], message: "Unknown node ore" }]);
  });

  it("leaves the original document as it was", () => {
    const before = structuredClone(document);
    edit({ type: "removeNodes", graph: "root", ids: ["ore", "smelt"] });
    expect(document).toEqual(before);
  });

  it("is undone by applying its inverse patches", () => {
    const {
      document: next,
      patches,
      inversePatches,
    } = edit(
      { type: "removeNodes", graph: "root", ids: ["split"] },
      { type: "moveNodes", graph: "root", positions: { ore: { x: 3, y: 4 } } },
    );
    expect(applyPatches(next, inversePatches)).toEqual(document);
    expect(applyPatches(document, patches)).toEqual(next);
  });
});

describe("describing commands for the history", () => {
  it.each<[string, ResolvedCommand[]]>([
    ["Add node", [{ type: "addNode", graph: "root", id: "j", node: { kind: "junction" }, position: { x: 0, y: 0 } }]],
    ["Delete nodes", [{ type: "removeNodes", graph: "root", ids: ["a", "b"] }]],
    ["Move nodes", [{ type: "moveNodes", graph: "root", positions: {} }]],
    [
      "Edit",
      [
        { type: "disconnect", graph: "root", ids: ["e1"] },
        { type: "setPin", graph: "root", id: "smelt", pin: null },
      ],
    ],
  ])("calls it %s", (label, commands) => {
    expect(describeCommands(commands)).toBe(label);
  });
});
