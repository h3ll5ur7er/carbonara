import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Clipboard } from "../../contracts/clipboard";
import { Document, type Edge, type Node } from "../../contracts/document";
import { exampleDocument } from "../../contracts/document.fixture";
import { applyCommands, applyPatches } from "./commands";
import { copyNodes, pasteCommands } from "./clipboard";

const base = Document.parse(exampleDocument);

const item = fc.constantFrom("iron-ore", "iron-ingot");
const node: fc.Arbitrary<Node> = fc.oneof(
  fc.record({ kind: fc.constant("junction" as const) }),
  fc.record({ kind: fc.constant("source" as const), item }),
  fc.record({ kind: fc.constant("recipe" as const), recipe: fc.constant("iron-ingot") }),
  fc.record({ kind: fc.constant("note" as const), text: fc.string({ maxLength: 4 }) }),
  fc.record({ kind: fc.constant("instance" as const), blueprint: fc.constant("rods") }),
  // Only allowed inside the blueprint: pasting it into the root graph must leave it out.
  fc.record({ kind: fc.constant("port" as const), direction: fc.constant("in" as const), item }),
);
// Ids that look like pasted ones too, so fresh ids have something to collide with.
const nodeIds = ["a", "b", "smelter-000001", "smelter-abcdef", "ore-000002", "c-1a2b3c-4d5e6f", "d"];

/** A document whose root graph holds random nodes and flows (the example's blueprint stays). */
const documents = fc
  .uniqueArray(fc.constantFrom(...nodeIds), { minLength: 1, maxLength: nodeIds.length })
  .chain((ids) =>
    fc
      .record({
        nodes: fc.tuple(...ids.map(() => node)),
        positions: fc.tuple(...ids.map(() => fc.record({ x: fc.integer({ max: 900 }), y: fc.integer({ max: 900 }) }))),
        edges: fc.array(
          fc.record({ from: fc.constantFrom(...ids), to: fc.constantFrom(...ids), item, port: fc.boolean() }),
          { maxLength: 8 },
        ),
      })
      .map(({ nodes, positions, edges }): Document => {
        const graphNodes = Object.fromEntries(ids.map((id, index) => [id, nodes[index] as Node]));
        const graphEdges: Record<string, Edge> = {};
        edges.forEach(({ from, to, item: carried, port }, index) => {
          graphEdges[index % 2 ? `e${index}` : `flow-00000${index}`] = {
            from,
            to,
            item: carried,
            ...(port && graphNodes[to]?.kind === "instance" && { toPort: "in" }),
          };
        });
        return {
          ...base,
          graph: { nodes: graphNodes, edges: graphEdges },
          layout: { root: Object.fromEntries(ids.map((id, index) => [id, positions[index] ?? { x: 0, y: 0 }])) },
        };
      }),
  );

/** A paste scenario: a copy of some nodes, pasted into the same document or one with nodes removed since. */
const scenarios = documents.chain((document) => {
  const ids = Object.keys(document.graph.nodes);
  return fc.record({
    document: fc.constant(document),
    copied: fc.uniqueArray(fc.constantFrom(...ids), { minLength: 1 }),
    removedSince: fc.uniqueArray(fc.constantFrom(...ids)),
    otherDocument: fc.boolean(),
    // What the other document has of the copied instances' blueprint.
    blueprintThere: fc.constantFrom("same" as const, "none" as const, "different" as const),
    connections: fc.boolean(),
    offset: fc.record({ x: fc.integer({ min: -480, max: 480 }), y: fc.integer({ min: -480, max: 480 }) }),
    // Id suggestions that often collide with each other and with the graph's ids, then unique ones.
    suggestions: fc.array(fc.constantFrom("000001", "abcdef", "000002", "1a2b3c"), { maxLength: 12 }),
  });
});

function ids(suggestions: string[]): () => string {
  const queue = [...suggestions];
  let next = 0;
  return () => queue.shift() ?? `f${(next++).toString(16).padStart(5, "0")}`;
}

function setUp(scenario: {
  document: Document;
  copied: string[];
  removedSince: string[];
  otherDocument: boolean;
  blueprintThere: "same" | "none" | "different";
  connections: boolean;
  offset: { x: number; y: number };
  suggestions: string[];
}) {
  const copy = copyNodes(scenario.document, "root", scenario.copied);
  if (!copy.ok) throw new Error("copying existing nodes must work");
  let target = scenario.otherDocument ? { ...scenario.document, id: "doc-other" } : scenario.document;
  if (scenario.removedSince.length > 0) {
    const removed = applyCommands(target, [{ type: "removeNodes", graph: "root", ids: scenario.removedSince }]);
    if (!removed.ok) throw new Error("removing existing nodes must work");
    target = removed.value.document;
  }
  if (scenario.otherDocument) target = withBlueprint(target, scenario.blueprintThere);
  const paste = pasteCommands(
    target,
    "root",
    copy.value,
    { offset: scenario.offset, connections: scenario.connections },
    ids(scenario.suggestions),
  );
  if (!paste.ok) throw new Error("pasting into the root graph must work");
  return { clipboard: copy.value, target, paste: paste.value, edit: applyCommands(target, paste.value.commands) };
}

/**
 * The other document as it has the rods: alike, not at all (and so without instances of them), or another
 * blueprint under their id (with the same ports, so the instances it places stay whole).
 */
function withBlueprint(target: Document, there: "same" | "none" | "different"): Document {
  if (there === "same") return target;
  if (there === "different") {
    const rods = target.blueprints.rods ?? { name: "Rods", graph: { nodes: {}, edges: {} } };
    const make: Node = { kind: "recipe", recipe: "iron-plate" };
    return {
      ...target,
      blueprints: { rods: { name: "Plates", graph: { ...rods.graph, nodes: { ...rods.graph.nodes, make } } } },
    };
  }
  const instances = Object.keys(target.graph.nodes).filter((id) => target.graph.nodes[id]?.kind === "instance");
  const stripped =
    instances.length > 0 ? applyCommands(target, [{ type: "removeNodes", graph: "root", ids: instances }]) : undefined;
  if (stripped && !stripped.ok) throw new Error("removing existing nodes must work");
  const document = stripped?.value.document ?? target;
  return { ...document, blueprints: {}, layout: { root: document.layout.root ?? {} } };
}

describe("paste invariants", () => {
  it("a paste always applies, adds exactly its new nodes under ids the graph didn't have, and leaves the rest", () => {
    fc.assert(
      fc.property(scenarios, (scenario) => {
        const { target, paste, edit } = setUp(scenario);
        expect(edit.ok).toBe(true);
        if (!edit.ok) return;
        const after = edit.value.document;
        for (const id of paste.nodeIds) expect(target.graph.nodes[id]).toBeUndefined();
        expect(new Set(paste.nodeIds).size).toBe(paste.nodeIds.length);
        expect(Object.keys(after.graph.nodes).sort()).toEqual(
          [...Object.keys(target.graph.nodes), ...paste.nodeIds].sort(),
        );
        for (const [id, existing] of Object.entries(target.graph.nodes))
          expect(after.graph.nodes[id]).toEqual(existing);
        for (const [id, existing] of Object.entries(target.graph.edges))
          expect(after.graph.edges[id]).toEqual(existing);
        for (const [id, position] of Object.entries(target.layout.root ?? {})) {
          expect(after.layout.root?.[id]).toEqual(position);
        }
      }),
    );
  });

  it("a paste never leaves a flow without both of its nodes", () => {
    fc.assert(
      fc.property(scenarios, (scenario) => {
        const { edit } = setUp(scenario);
        if (!edit.ok) throw new Error("the paste must apply");
        const { nodes, edges } = edit.value.document.graph;
        for (const edge of Object.values(edges)) {
          expect(nodes[edge.from]).toBeDefined();
          expect(nodes[edge.to]).toBeDefined();
        }
      }),
    );
  });

  it("the pasted nodes are copies of the copied ones, moved by the offset, with the flows among them", () => {
    fc.assert(
      fc.property(scenarios, (scenario) => {
        const { clipboard, paste, edit } = setUp(scenario);
        if (!edit.ok) throw new Error("the paste must apply");
        const after = edit.value.document;
        const kept = Object.keys(clipboard.graph.nodes).filter((id) => clipboard.graph.nodes[id]?.kind !== "port");
        expect(paste.nodeIds).toHaveLength(kept.length);
        kept.forEach((original, index) => {
          const pasted = paste.nodeIds[index] ?? "";
          const copy = clipboard.graph.nodes[original];
          const node = after.graph.nodes[pasted];
          if (copy?.kind === "instance" && node?.kind === "instance") {
            // An instance places a blueprint like the one it placed, under the target's id for it.
            expect(after.blueprints[node.blueprint]?.graph).toEqual(clipboard.blueprints[copy.blueprint]?.graph);
          } else expect(node).toEqual(copy);
          const was = clipboard.layout[original] ?? { x: 0, y: 0 };
          expect(after.layout.root?.[pasted]).toMatchObject({
            x: was.x + scenario.offset.x,
            y: was.y + scenario.offset.y,
          });
        });
        const pasted = new Set(paste.nodeIds);
        const among = Object.values(after.graph.edges).filter((edge) => pasted.has(edge.from) && pasted.has(edge.to));
        const copiedAmong = Object.values(clipboard.graph.edges).filter((edge) =>
          [edge.from, edge.to].every((id) => kept.includes(id)),
        );
        expect(among).toHaveLength(copiedAmong.length);
      }),
    );
  });

  it("a paste never leaves an instance without its blueprint, and keeps the blueprints there were", () => {
    fc.assert(
      fc.property(scenarios, (scenario) => {
        const { target, paste, edit } = setUp(scenario);
        if (!edit.ok) throw new Error("the paste must apply");
        const after = edit.value.document;
        for (const node of Object.values(after.graph.nodes)) {
          if (node.kind === "instance") expect(after.blueprints).toHaveProperty([node.blueprint]);
        }
        for (const [id, blueprint] of Object.entries(target.blueprints)) {
          expect(after.blueprints[id]).toEqual(blueprint);
        }
        // Ports may be left out of the root graph, but never a subgraph for want of its blueprint.
        expect(paste.leftOut.filter((text) => text.includes("doesn't have"))).toEqual([]);
      }),
    );
  });

  it("brings blueprints along in enough of the scenarios to be meaningful", () => {
    const samples = fc.sample(scenarios, { seed: 1, numRuns: 200 });
    const bringing = samples.filter((scenario) =>
      setUp(scenario).paste.commands.some((command) => command.type === "addBlueprint"),
    );
    expect(bringing.length).toBeGreaterThan(20);
  });

  it("pasting the same copy again adds no blueprint: alike ones are reused", () => {
    fc.assert(
      fc.property(scenarios, (scenario) => {
        const { clipboard, edit } = setUp(scenario);
        if (!edit.ok) throw new Error("the paste must apply");
        const options = { offset: scenario.offset, connections: false };
        const again = pasteCommands(edit.value.document, "root", clipboard, options, ids([]));
        if (!again.ok) throw new Error("pasting into the root graph must work");
        expect(again.value.commands.filter((command) => command.type === "addBlueprint")).toEqual([]);
      }),
    );
  });

  it("only a paste with connections into its own graph connects to nodes outside it", () => {
    fc.assert(
      fc.property(scenarios, (scenario) => {
        const { paste, edit } = setUp(scenario);
        if (!edit.ok) throw new Error("the paste must apply");
        const pasted = new Set(paste.nodeIds);
        const crossing = Object.values(edit.value.document.graph.edges).filter(
          (edge) => pasted.has(edge.from) !== pasted.has(edge.to),
        );
        if (!scenario.connections || scenario.otherDocument) expect(crossing).toEqual([]);
      }),
    );
  });

  it("undoing a paste restores the document", () => {
    fc.assert(
      fc.property(scenarios, (scenario) => {
        const { target, edit } = setUp(scenario);
        if (!edit.ok) throw new Error("the paste must apply");
        expect(applyPatches(edit.value.document, edit.value.inversePatches)).toEqual(target);
      }),
    );
  });

  it("a copy survives the trip through the system clipboard's text", () => {
    fc.assert(
      fc.property(scenarios, (scenario) => {
        const { clipboard } = setUp(scenario);
        expect(Clipboard.parse(JSON.parse(JSON.stringify(clipboard)))).toEqual(clipboard);
      }),
    );
  });
});
