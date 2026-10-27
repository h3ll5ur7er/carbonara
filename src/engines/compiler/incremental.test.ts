import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Document, Edge, Graph, Node } from "../../contracts/document";
import { ok } from "../../contracts/result";
import type { Solution } from "../../contracts/solver";
import { compile, compileMemo, type Compiled } from "./compile";
import { fixturePlugin } from "./hooks.fixture";
import { resultsMemo, toResults } from "./results";
import { templatePack, waterLoop } from "./template.fixture";

const pack = templatePack();

/** Ids from a small set, so edits hit existing nodes and edges and edges hit nodes. */
const id = fc.constantFrom("a", "b", "c", "d", "e", "f", "g", "h");
const item = fc.constantFrom("ferrite-ore", "water", "dirty-water", "clean-ferrite", "iron-plate", "coal", "nothing");
const node: fc.Arbitrary<Node> = fc.oneof(
  fc.record({
    kind: fc.constant("recipe" as const),
    recipe: fc.constantFrom(...pack.recipes.map((recipe) => recipe.id)),
    fields: fc.record({ speed: fc.constantFrom(50, 100, 300), boosted: fc.boolean() }),
    pin: fc.option(fc.record({ type: fc.constant("machines" as const), count: fc.constantFrom(1, 2.5) }), {
      nil: undefined,
    }),
  }),
  fc.record({ kind: fc.constant("source" as const), item }),
  fc.record({ kind: fc.constant("sink" as const), item, targetPerSecond: fc.constantFrom(0.5, 1, 3) }),
  fc.constant({ kind: "junction" as const }),
  fc.constant({ kind: "note" as const, text: "note" }),
  fc.record({ kind: fc.constant("instance" as const), blueprint: fc.constantFrom("inner", "missing") }),
  fc.record({ kind: fc.constant("port" as const), direction: fc.constantFrom("in" as const, "out" as const), item }),
);
const edge: fc.Arbitrary<Edge> = fc.record({
  from: id,
  to: id,
  item,
  logistics: fc.option(fc.constantFrom("conveyor-1", "pipe", "hyperloop"), { nil: undefined }),
  fromPort: fc.option(id, { nil: undefined }),
  toPort: fc.option(id, { nil: undefined }),
});

/** One change to a document, made the way the editor makes them: everything else keeps its objects. */
type Change =
  | { graph: "root" | "inner"; set: string; node: Node }
  | { graph: "root" | "inner"; drop: string }
  | { graph: "root" | "inner"; connect: string; edge: Edge }
  | { graph: "root" | "inner"; disconnect: string }
  | { settings: number }
  | { rename: string };

const graphName = fc.constantFrom("root" as const, "inner" as const);
const change: fc.Arbitrary<Change> = fc.oneof(
  fc.record({ graph: graphName, set: id, node }),
  fc.record({ graph: graphName, drop: id }),
  fc.record({ graph: graphName, connect: id, edge }),
  fc.record({ graph: graphName, disconnect: id }),
  fc.record({ settings: fc.constantFrom(0, 1, 2) }),
  fc.record({ rename: fc.constantFrom("Inner", "Renamed") }),
);

function applyChange(document: Document, change: Change): Document {
  if ("settings" in change) return { ...document, settings: { plugin: { boosters: change.settings } } };
  const inner = document.blueprints.inner as Document["blueprints"][string];
  if ("rename" in change) return { ...document, blueprints: { inner: { ...inner, name: change.rename } } };
  const graph = change.graph === "root" ? document.graph : inner.graph;
  const without = <T>(record: Record<string, T>, key: string) =>
    Object.fromEntries(Object.entries(record).filter(([other]) => other !== key));
  let next: Graph;
  if ("set" in change) next = { ...graph, nodes: { ...graph.nodes, [change.set]: change.node } };
  else if ("drop" in change) next = { ...graph, nodes: without(graph.nodes, change.drop) };
  else if ("connect" in change) next = { ...graph, edges: { ...graph.edges, [change.connect]: change.edge } };
  else next = { ...graph, edges: without(graph.edges, change.disconnect) };
  if (change.graph === "root") return { ...document, graph: next };
  return { ...document, blueprints: { inner: { ...inner, graph: next } } };
}

const start: Document = {
  ...waterLoop(),
  blueprints: { inner: { name: "Inner", graph: { nodes: {}, edges: {} } } },
};

describe("compiling incrementally", () => {
  it("gives exactly what compiling from scratch gives, edit after edit", () => {
    fc.assert(
      fc.property(fc.array(change, { minLength: 1, maxLength: 25 }), (changes) => {
        const memo = compileMemo();
        let document = start;
        compile({ document, pack, plugin: fixturePlugin }, memo);
        for (const next of changes) {
          document = applyChange(document, next);
          const incremental = compile({ document, pack, plugin: fixturePlugin }, memo);
          const fresh = compile({ document, pack, plugin: fixturePlugin });
          expect(incremental).toEqual(fresh);
          expect(JSON.stringify(incremental)).toBe(JSON.stringify(fresh));
        }
      }),
      { numRuns: 300 },
    );
  });

  it("keeps the model objects of nodes and edges that didn't change", () => {
    const memo = compileMemo();
    const original = waterLoop();
    const before = compile({ document: original, pack, plugin: fixturePlugin }, memo);
    const document = applyChange(original, {
      graph: "root",
      set: "plates",
      node: { kind: "sink", item: "iron-plate", targetPerSecond: 2 },
    });
    const after = compile({ document, pack, plugin: fixturePlugin }, memo);
    const changed = after.model.nodes.filter((modelNode, index) => modelNode !== before.model.nodes[index]);
    expect(changed).toEqual([{ kind: "process", rates: [{ item: 5, perSecond: -1 }], pin: 2, cost: 0 }]);
    expect(after.model.edges.every((modelEdge, index) => modelEdge === before.model.edges[index])).toBe(true);
  });
});

/** A solution for a compiled document, its numbers picked from `values` from `offset` on. */
function solutionFor(compiled: Compiled, values: number[], offset: number): Solution {
  let next = offset;
  const pick = () => values[next++ % values.length] as number;
  const blueprints = compiled.model.blueprints ?? [];
  return {
    activity: compiled.model.nodes.map(pick),
    flow: compiled.model.edges.map(pick),
    surplus: [],
    deficit: [],
    overflow: [],
    pinMisses: [],
    instances: compiled.model.nodes.flatMap((modelNode, index) => {
      const blueprint = modelNode.blueprint === undefined ? undefined : blueprints[modelNode.blueprint];
      if (!blueprint) return [];
      return [{ node: index, ports: blueprint.ports.map(pick), activity: blueprint.nodes.map(pick) }];
    }),
  };
}

describe("mapping results incrementally", () => {
  it("gives exactly what mapping from scratch gives, edit after edit", () => {
    fc.assert(
      fc.property(
        fc.array(change, { minLength: 1, maxLength: 15 }),
        fc.array(fc.constantFrom(0, 1, 2.5, 3.0000000001), { minLength: 1, maxLength: 7 }),
        fc.array(fc.nat(3), { minLength: 1, maxLength: 15 }),
        (changes, values, offsets) => {
          const compiling = compileMemo();
          const mapping = resultsMemo();
          let document = start;
          changes.forEach((next, step) => {
            document = applyChange(document, next);
            const compiled = compile({ document, pack, plugin: fixturePlugin }, compiling);
            const outcome = ok(solutionFor(compiled, values, offsets[step % offsets.length] as number));
            const incremental = toResults(compiled, outcome, fixturePlugin, step, mapping);
            const fresh = toResults(compiled, outcome, fixturePlugin, step);
            expect(incremental).toEqual(fresh);
            expect(JSON.stringify(incremental)).toBe(JSON.stringify(fresh));
          });
        },
      ),
      { numRuns: 300 },
    );
  });

  it("keeps the result objects of nodes and edges whose numbers didn't change", () => {
    const compiled = compile({ document: waterLoop(), pack, plugin: fixturePlugin });
    const memo = resultsMemo();
    const solution = solutionFor(compiled, [1, 2], 0);
    const before = toResults(compiled, ok(solution), fixturePlugin, 1, memo);
    const activity = [...solution.activity];
    activity[0] = 7;
    const after = toResults(compiled, ok({ ...solution, activity }), fixturePlugin, 2, memo);
    const changed = Object.keys(after.nodes).filter((id) => after.nodes[id] !== before.nodes[id]);
    expect(changed).toEqual([compiled.nodes[0]]);
    expect(Object.keys(after.edges).every((id) => after.edges[id] === before.edges[id])).toBe(true);
  });
});
