import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Document, type Graph, type Node } from "../../contracts/document";
import { exampleDocument } from "../../contracts/document.fixture";
import { applyCommands, applyPatches, type Edit, type ResolvedCommand } from "./commands";

const start = Document.parse(exampleDocument);

const item = fc.constantFrom("iron-ore", "iron-ingot", "iron-rod");
const position = fc.record({ x: fc.integer({ min: -500, max: 500 }), y: fc.integer({ min: -500, max: 500 }) });
const fieldValue = fc.oneof(fc.integer(), fc.boolean(), fc.constantFrom("a", "b"));
const port = fc.constantFrom("in", "out");

const node: fc.Arbitrary<Node> = fc.oneof(
  fc.record({ kind: fc.constant("junction" as const) }),
  fc.record({ kind: fc.constant("source" as const), item }),
  fc.record({ kind: fc.constant("sink" as const), item }),
  fc.record({ kind: fc.constant("recipe" as const), recipe: fc.constant("iron-ingot") }),
  fc.record({ kind: fc.constant("note" as const), text: fc.string() }),
  fc.record({ kind: fc.constant("port" as const), direction: fc.constantFrom("in" as const, "out" as const), item }),
  fc.record({ kind: fc.constant("instance" as const), blueprint: fc.constantFrom("rods", "ghost") }),
);

interface Pools {
  graphs: string[];
  nodes: string[];
  newNodes: string[];
  recipes: string[];
  edges: string[];
  newEdges: string[];
}

/** Commands drawing from small id pools, so they mostly hit existing (or, when adding, fresh) ids, and sometimes don't. */
function commandIn(pools: Pools): fc.Arbitrary<ResolvedCommand> {
  const graph = fc.constantFrom(...pools.graphs);
  const nodeId = fc.constantFrom(...pools.nodes, ...pools.newNodes);
  const newNodeId = fc.constantFrom(...pools.newNodes, ...pools.nodes.slice(0, 1));
  const recipeId = fc.constantFrom(...pools.recipes, ...pools.nodes.slice(0, 1));
  const edgeId = fc.constantFrom(...pools.edges, ...pools.newEdges);
  const newEdgeId = fc.constantFrom(...pools.newEdges, ...pools.edges.slice(0, 1));
  const edge = fc
    .tuple(nodeId, nodeId, item, fc.option(port, { freq: 8 }), fc.option(port, { freq: 8 }))
    .map(([from, to, item, fromPort, toPort]) => ({
      from,
      to,
      item,
      ...(fromPort === null ? {} : { fromPort }),
      ...(toPort === null ? {} : { toPort }),
    }));
  return fc.oneof(
    fc.record({ type: fc.constant("addNode" as const), graph, id: newNodeId, node, position }),
    fc.record({
      type: fc.constant("removeNodes" as const),
      graph,
      ids: fc.uniqueArray(nodeId, { minLength: 1, maxLength: 2 }),
    }),
    fc.record({ type: fc.constant("connect" as const), graph, id: newEdgeId, edge }),
    fc.record({
      type: fc.constant("disconnect" as const),
      graph,
      ids: fc.uniqueArray(edgeId, { minLength: 1, maxLength: 2 }),
    }),
    fc.record({
      type: fc.constant("moveNodes" as const),
      graph,
      positions: fc.dictionary(nodeId, position, { maxKeys: 2 }),
    }),
    fc.record({
      type: fc.constant("setNodeFields" as const),
      graph,
      id: recipeId,
      fields: fc.dictionary(fc.constantFrom("clock", "mode"), fieldValue),
    }),
    fc.record({
      type: fc.constant("setPin" as const),
      graph,
      id: recipeId,
      pin: fc.option(fc.record({ type: fc.constant("machines" as const), count: fc.nat(10) }), { nil: null }),
    }),
    fc.record({
      type: fc.constant("setRate" as const),
      graph,
      // Sources and sinks, plus a recipe the command must refuse.
      id: fc.constantFrom("ore", "out", ...pools.recipes),
      perSecond: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: null }),
    }),
    fc.record({
      type: fc.constant("removeAndBridge" as const),
      graph,
      ids: fc.uniqueArray(nodeId, { minLength: 1, maxLength: 2 }),
    }),
    fc.record({
      type: fc.constant("setLocked" as const),
      graph,
      ids: fc.uniqueArray(nodeId, { minLength: 1, maxLength: 2 }),
      locked: fc.boolean(),
    }),
  );
}

const root: Pools = {
  graphs: ["root"],
  nodes: ["ore", "smelt", "split", "out", "rods", "area"],
  newNodes: ["n1", "n2", "n3"],
  recipes: ["smelt"],
  edges: ["e1", "e2", "e3", "e4"],
  newEdges: ["x1", "x2", "x3"],
};
const rods: Pools = {
  graphs: ["rods"],
  nodes: ["in", "make", "out"],
  newNodes: ["n1", "n2"],
  recipes: ["make"],
  edges: ["a", "b"],
  newEdges: ["x1", "x2"],
};
const anywhere: Pools = {
  graphs: ["root", "rods", "ghost"],
  nodes: ["ore", "make", "ghost"],
  newNodes: ["n1"],
  recipes: ["smelt", "make"],
  edges: ["e1", "a", "ghost"],
  newEdges: ["x1"],
};
const command = fc.oneof(
  { weight: 6, arbitrary: commandIn(root) },
  { weight: 3, arbitrary: commandIn(rods) },
  { weight: 1, arbitrary: commandIn(anywhere) },
);
const batches = fc.array(fc.array(command, { minLength: 1, maxLength: 3 }), { maxLength: 10 });

/** Applies the batches one after another, skipping rejected ones, like a user whose bad edits bounce. */
function run(commandBatches: ResolvedCommand[][]): { states: Document[]; edits: Edit[] } {
  const states = [start];
  const edits: Edit[] = [];
  for (const batch of commandBatches) {
    const result = applyCommands(states.at(-1) ?? start, batch);
    if (!result.ok) continue;
    edits.push(result.value);
    states.push(result.value.document);
  }
  return { states, edits };
}

function graphs(document: Document): [string, Graph][] {
  const blueprints = Object.entries(document.blueprints).map(([id, blueprint]): [string, Graph] => [
    id,
    blueprint.graph,
  ]);
  return [["root", document.graph], ...blueprints];
}

function portsOf(document: Document, graph: Graph, nodeId: string, direction: "in" | "out"): string[] {
  const node = graph.nodes[nodeId];
  if (node?.kind !== "instance") return [];
  const blueprint = document.blueprints[node.blueprint];
  return Object.entries(blueprint?.graph.nodes ?? {})
    .filter(([, port]) => port.kind === "port" && port.direction === direction)
    .map(([id]) => id);
}

describe("the editing engine (property tests)", () => {
  it("accepts enough of the generated edits to be meaningful", () => {
    const samples = fc.sample(batches, { seed: 1, numRuns: 300 });
    const total = samples.reduce((sum, commandBatches) => sum + commandBatches.length, 0);
    const accepted = samples.reduce((sum, commandBatches) => sum + run(commandBatches).edits.length, 0);
    expect(accepted / total).toBeGreaterThan(0.2);
  });

  it("undoes every edit by applying its inverse patches: undo(do(x)) = x", () => {
    fc.assert(
      fc.property(batches, (commandBatches) => {
        const { states, edits } = run(commandBatches);
        edits.forEach((edit, index) => {
          expect(applyPatches(edit.document, edit.inversePatches)).toEqual(states[index]);
          expect(applyPatches(states[index] ?? start, edit.patches)).toEqual(edit.document);
        });
        const last = states.at(-1) ?? start;
        const undone = edits.reduceRight((document, edit) => applyPatches(document, edit.inversePatches), last);
        expect(undone).toEqual(start);
      }),
    );
  });

  it("never leaves dangling edges, positions or self-containing blueprints", () => {
    fc.assert(
      fc.property(batches, (commandBatches) => {
        for (const document of run(commandBatches).states) {
          for (const [graphKey, graph] of graphs(document)) {
            for (const edge of Object.values(graph.edges)) {
              expect(graph.nodes).toHaveProperty([edge.from]);
              expect(graph.nodes).toHaveProperty([edge.to]);
              if (edge.fromPort) expect(portsOf(document, graph, edge.from, "out")).toContain(edge.fromPort);
              if (edge.toPort) expect(portsOf(document, graph, edge.to, "in")).toContain(edge.toPort);
            }
            for (const id of Object.keys(document.layout[graphKey] ?? {})) expect(graph.nodes).toHaveProperty([id]);
            for (const node of Object.values(graph.nodes)) {
              if (node.kind === "instance") expect(node.blueprint).not.toBe(graphKey);
            }
          }
        }
      }),
    );
  });

  it("produces documents that still satisfy the document contract", () => {
    fc.assert(
      fc.property(batches, (commandBatches) => {
        for (const document of run(commandBatches).states) expect(Document.safeParse(document).success).toBe(true);
      }),
    );
  });
});
